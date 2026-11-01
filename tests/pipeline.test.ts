import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { createDb, type Db } from "@/lib/db";
import { categories, statements, transactions } from "@/lib/db/schema";
import { SAMPLE_ACCOUNTS, SAMPLE_MONTHS, buildSampleStatements, renderSampleStatementPdf, sampleFileName } from "@/lib/dev/sample-statements";
import { acceptInvite, createAccount, createHousehold, createInvite, ensureAuthUser, findOrCreateUser, getMembership } from "@/lib/households";
import { processStatement, confirmStatement, ibanHash, legacyIbanHash, upgradeLegacyIbanHashes } from "@/lib/pipeline/process-statement";
import { createStatementFromUpload } from "@/lib/pipeline/upload";
import { listTransactions } from "@/lib/queries";
import { applyAllRules, applyRuleRetroactively, autoLinkTransfers, categorizeTransactions, previewRule } from "@/lib/pipeline/categorize";
import type { FileStorage } from "@/lib/services/storage";
import { accounts, categoryRules, transactionChanges } from "@/lib/db/schema";
import { deleteCategory } from "@/lib/categories";

class MemoryStorage implements FileStorage {
  readonly kind = "memory";
  files = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array) {
    this.files.set(key, bytes);
  }
  async get(key: string) {
    const file = this.files.get(key);
    if (!file) throw new Error("missing");
    return file;
  }
  async remove(key: string) {
    this.files.delete(key);
  }
}

describe("statement pipeline (PGlite + offline parser)", () => {
  let db: Db;
  const storage = new MemoryStorage();
  let householdId: string;
  let alexId: string;
  const samples = buildSampleStatements(SAMPLE_MONTHS);
  const accountIds = new Map<string, string>();

  beforeAll(async () => {
    db = await createDb({ dataDir: "memory", url: "" });
    const alex = await findOrCreateUser(db, "alex@example.com", "Alex");
    const sam = await findOrCreateUser(db, "sam@example.com", "Sam");
    alexId = alex.id;
    householdId = (await createHousehold(db, alex.id, "Alex & Sam")).id;
    const invite = await createInvite(db, householdId, alex.id, "sam@example.com");
    await acceptInvite(db, invite.token, sam);
    const userIds = { alex: alex.id, sam: sam.id };

    for (const account of SAMPLE_ACCOUNTS) {
      const created = await createAccount(db, householdId, {
        bankId: account.bank,
        name: account.name,
        iban: account.iban,
        owners: account.owners.map((o) => ({ userId: userIds[o], sharePct: 100 / account.owners.length })),
      });
      accountIds.set(account.key, created.id);
    }
  });

  it("ingests every sample statement, auto-detects the account and validates balances", async () => {
    for (const sample of samples) {
      const bytes = await renderSampleStatementPdf(sample);
      const { statement } = await createStatementFromUpload(db, { householdId, userId: alexId, fileName: sampleFileName(sample), bytes }, storage);
      await processStatement(db, statement.id, { storage });
      const [processed] = await db.select().from(statements).where(eq(statements.id, statement.id));
      expect(processed!.error).toBeNull();
      expect(processed!.status).toBe("needs_review");
      expect(processed!.accountId).toBe(accountIds.get(sample.account.key));
      expect(processed!.issues).toEqual([]);
      expect(processed!.openingBalanceCents).toBe(sample.opening);
      expect(processed!.closingBalanceCents).toBe(sample.closing);

      const rows = await db.select().from(transactions).where(eq(transactions.statementId, statement.id)).orderBy(transactions.position);
      expect(rows.map((r) => r.amountCents)).toEqual(sample.rows.map((r) => r.amount));
    }
  });

  it("skips duplicate files", async () => {
    const bytes = await renderSampleStatementPdf(samples[0]!);
    const result = await createStatementFromUpload(db, { householdId, userId: alexId, fileName: "again.pdf", bytes }, storage);
    expect(result.duplicate).toBe(true);
  });

  it("links transfers between our own accounts", async () => {
    const linked = await db.select().from(transactions).where(and(eq(transactions.householdId, householdId), isNotNull(transactions.transferGroupId)));
    // 6 months × (Alex → shared, Sam → shared) × 2 sides
    expect(linked).toHaveLength(24);

    const outgoing = linked.find((t) => t.amountCents < 0)!;
    const incoming = linked.find((t) => t.transferGroupId === outgoing.transferGroupId && t.id !== outgoing.id)!;
    const list = (visible: string[]) => listTransactions(db, householdId, visible, { accountId: outgoing.accountId, from: outgoing.bookedAt, to: outgoing.bookedAt });
    const row = (await list([...accountIds.values()])).rows.find((r) => r.tx.id === outgoing.id)!;
    expect(row.linked).toEqual([expect.objectContaining({ hidden: false, id: incoming.id, accountId: incoming.accountId, amountCents: -outgoing.amountCents })]);
    // The other side's details stay private when its account isn't visible.
    const hidden = (await list([outgoing.accountId])).rows.find((r) => r.tx.id === outgoing.id)!;
    expect(hidden.linked).toEqual([{ hidden: true, id: `hidden:${outgoing.transferGroupId}` }]);
  });

  it("categorizes most transactions and flags the rest", async () => {
    const all = await db.select().from(transactions).where(eq(transactions.householdId, householdId));
    const uncategorized = all.filter((t) => t.categoryId === null);
    expect(uncategorized.length / all.length).toBeLessThan(0.25);
    expect(uncategorized.every((t) => t.flagged)).toBe(true);
  });

  it("treats a description naming another of our accounts as a transfer and links both sides", async () => {
    const alexAccount = accountIds.get("alex-ing")!;
    const sharedAccount = accountIds.get("shared-ing")!;
    const inserted = await db
      .insert(transactions)
      .values([
        { householdId, accountId: alexAccount, bookedAt: "2031-03-03", descriptionRaw: "Hacia Cuenta Comun", amountCents: -12_345, fingerprint: "name-out" },
        { householdId, accountId: sharedAccount, bookedAt: "2031-03-04", descriptionRaw: "Desde Cuenta Nómina Alex", amountCents: 12_345, fingerprint: "name-in" },
      ])
      .returning();
    const ids = inserted.map((t) => t.id);

    const result = await categorizeTransactions(db, householdId, ids);
    expect(result.byAccountName).toBe(2);
    await autoLinkTransfers(db, householdId);

    const rows = await db.select().from(transactions).where(inArray(transactions.id, ids));
    expect(rows.every((r) => r.categorizedBy === "transfer" && !r.flagged)).toBe(true);
    expect(rows[0]!.transferGroupId).not.toBeNull();
    expect(rows[0]!.transferGroupId).toBe(rows[1]!.transferGroupId);
  });

  it("applies a new rule retroactively", async () => {
    const [restaurants] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.householdId, householdId), eq(categories.slug, "restaurants")));
    const rule = { matchType: "contains" as const, pattern: "BODEGA EL RINCON", categoryId: restaurants!.id };
    const preview = await previewRule(db, householdId, rule);
    expect(preview.length).toBe(12);
    const [created] = await db.insert(categoryRules).values({ householdId, ...rule }).returning();
    expect(await applyRuleRetroactively(db, householdId, created!.id)).toBe(12);
    const stillFlagged = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), eq(transactions.merchant, "Bodega El Rincon"), isNull(transactions.categoryId)));
    expect(stillFlagged).toHaveLength(0);
    const accountIds = [...new Set((await db.select({ id: transactions.accountId }).from(transactions)).map((r) => r.id))];
    const { rows } = await listTransactions(db, householdId, accountIds, { q: "Bodega El Rincon" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tx.ruleId === created!.id && r.rule?.pattern === "BODEGA EL RINCON")).toBe(true);
  });

  it("re-applies enabled rules in priority order", async () => {
    const [groceries] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.householdId, householdId), eq(categories.slug, "groceries")));
    const [broad] = await db
      .insert(categoryRules)
      .values({ householdId, matchType: "contains", pattern: "BODEGA", categoryId: groceries!.id, priority: 5, enabled: false })
      .returning();
    expect(await applyAllRules(db, householdId)).toBe(0);
    expect(await applyRuleRetroactively(db, householdId, broad!.id)).toBe(0);

    await db.update(categoryRules).set({ enabled: true }).where(eq(categoryRules.id, broad!.id));
    expect(await applyAllRules(db, householdId)).toBeGreaterThanOrEqual(12);
    const bodega = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), eq(transactions.merchant, "Bodega El Rincon")));
    expect(bodega.every((t) => t.ruleId === broad!.id && t.categoryId === groceries!.id)).toBe(true);
    const [after] = await db.select().from(categoryRules).where(eq(categoryRules.id, broad!.id));
    expect(after!.lastMatchedAt).not.toBeNull();
    await db.delete(categoryRules).where(eq(categoryRules.id, broad!.id));
  });

  it("deletes a category, moving its transactions and rules or leaving them uncategorized", async () => {
    const bySlug = async (slug: string) =>
      (await db.select().from(categories).where(and(eq(categories.householdId, householdId), eq(categories.slug, slug))))[0]!;
    const [restaurants, transfers] = await Promise.all([bySlug("restaurants"), bySlug("transfers")]);
    const [temp, other] = await db
      .insert(categories)
      .values([
        { householdId, slug: "temp", name: "Temp", kind: "expense" },
        { householdId, slug: "other-temp", name: "Other temp", kind: "expense" },
      ])
      .returning();
    const bodega = await db.select().from(transactions).where(and(eq(transactions.householdId, householdId), eq(transactions.merchant, "Bodega El Rincon")));
    const [first, ...rest] = bodega.map((t) => t.id);
    await db.update(transactions).set({ categoryId: temp!.id, categorizedBy: "user" }).where(inArray(transactions.id, rest));
    await db.update(transactions).set({ categoryId: other!.id, categorizedBy: "user" }).where(eq(transactions.id, first!));
    const [rule] = await db.insert(categoryRules).values({ householdId, matchType: "contains", pattern: "BODEGA", categoryId: temp!.id }).returning();

    await expect(deleteCategory(db, householdId, alexId, transfers.id, null)).rejects.toThrow();
    expect(await deleteCategory(db, householdId, alexId, temp!.id, restaurants.id)).toEqual({ moved: rest.length });
    const moved = await db.select().from(transactions).where(inArray(transactions.id, rest));
    expect(moved.every((t) => t.categoryId === restaurants.id && t.categorizedBy === "user")).toBe(true);
    expect((await db.select().from(categoryRules).where(eq(categoryRules.id, rule!.id)))[0]!.categoryId).toBe(restaurants.id);
    expect(await db.select().from(transactionChanges).where(and(eq(transactionChanges.field, "category"), eq(transactionChanges.oldValue, temp!.id)))).toHaveLength(rest.length);

    expect(await deleteCategory(db, householdId, alexId, other!.id, null)).toEqual({ moved: 1 });
    const [orphan] = await db.select().from(transactions).where(eq(transactions.id, first!));
    expect(orphan).toMatchObject({ categoryId: null, categorizedBy: null, flagged: true, flagReason: "uncategorized" });
    expect(await db.select().from(categories).where(inArray(categories.id, [temp!.id, other!.id]))).toHaveLength(0);
    await db.delete(categoryRules).where(eq(categoryRules.id, rule!.id));
  });

  it("keeps removed transactions hidden when the statement is processed again", async () => {
    const [statement] = await db.select().from(statements).where(eq(statements.householdId, householdId)).orderBy(desc(statements.createdAt)).limit(1);
    const [victim] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.statementId, statement!.id), isNull(transactions.transferGroupId)))
      .limit(1);
    await db.update(transactions).set({ excludedAt: new Date() }).where(eq(transactions.id, victim!.id));
    const before = await db.select().from(transactions).where(eq(transactions.statementId, statement!.id));

    await processStatement(db, statement!.id, { storage });

    const after = await db.select().from(transactions).where(eq(transactions.statementId, statement!.id));
    expect(after).toHaveLength(before.length);
    expect(after.find((r) => r.id === victim!.id)?.excludedAt).not.toBeNull();
    const listed = await listTransactions(db, householdId, [statement!.accountId!], { statementId: statement!.id, pageSize: 2000 });
    expect(listed.rows.some((r) => r.tx.id === victim!.id)).toBe(false);
    expect(listed.total).toBe(before.length - 1);
  });

  it("splits a PDF covering several accounts into one statement per account", async () => {
    const [alex, shared] = [SAMPLE_ACCOUNTS.find((a) => a.key === "alex-ing")!, SAMPLE_ACCOUNTS.find((a) => a.key === "shared-ing")!];
    const lines = [
      "Saldo Inicial a 01/03/2025   Saldo final a 31/03/2025",
      `Cuenta Uno - IBAN: ${alex.iban}   Saldo final 90,00 €`,
      "Saldo inicial   100,00 €",
      "05/03   05/03   Compra Tienda Uno   -10,00 €   90,00 €",
      "Saldo final   90,00 €",
      "• Otro producto",
      `Cuenta Dos - IBAN: ${shared.iban}   Saldo final 500,00 €`,
      "Saldo inicial   400,00 €",
      "07/03   07/03   Ingreso Dos   100,00 €   500,00 €",
      "08/03   08/03   Compra Tienda Dos   -5,00 €   495,00 €",
      "Saldo final   495,00 €",
      "• Otro producto",
      "Cuenta Tres - IBAN: ES9121000418450200051332   Saldo final 10,00 €",
      "Saldo inicial   10,00 €",
      "Saldo final   10,00 €",
    ];
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([595, 842]);
    lines.forEach((line, i) => page.drawText(line, { x: 40, y: 800 - i * 14, size: 9, font }));
    const bytes = await pdf.save();

    const { statement } = await createStatementFromUpload(db, { householdId, userId: alexId, fileName: "multi.pdf", bytes }, storage);
    await processStatement(db, statement.id, { storage });

    const all = await db.select().from(statements).where(eq(statements.fileSha256, statement.fileSha256));
    expect(all).toHaveLength(3);
    const byAccount = (id: string | undefined) => all.find((s) => s.accountId === id)!;
    const first = byAccount(accountIds.get("alex-ing"));
    const second = byAccount(accountIds.get("shared-ing"));
    expect([first.status, second.status]).toEqual(["needs_review", "needs_review"]);
    expect([first.openingBalanceCents, first.closingBalanceCents]).toEqual([10000, 9000]);
    expect([second.openingBalanceCents, second.closingBalanceCents]).toEqual([40000, 49500]);
    expect(first.issues).toEqual([]);
    expect(second.issues).toEqual([]);
    expect(all.find((s) => s.accountId === null)?.status).toBe("needs_account");
    const txs = await db.select().from(transactions).where(eq(transactions.statementId, second.id)).orderBy(transactions.position);
    expect(txs.map((t) => [t.bookedAt, t.amountCents])).toEqual([["2025-03-07", 10000], ["2025-03-08", -500]]);

    // Processing again must not create more statements.
    await processStatement(db, first.id, { storage });
    expect(await db.select().from(statements).where(eq(statements.fileSha256, statement.fileSha256))).toHaveLength(3);
  });

  it("skips a statement another worker is actively processing, but takes over an abandoned one", async () => {
    const [statement] = await db.select().from(statements).where(eq(statements.householdId, householdId)).orderBy(desc(statements.createdAt)).limit(1);
    await db.update(statements).set({ status: "processing", progress: "extracting", progressAt: new Date() }).where(eq(statements.id, statement!.id));
    await processStatement(db, statement!.id, { storage });
    expect((await db.select().from(statements).where(eq(statements.id, statement!.id)))[0]!.status).toBe("processing");

    await db.update(statements).set({ progressAt: new Date(Date.now() - 10 * 60_000) }).where(eq(statements.id, statement!.id));
    await processStatement(db, statement!.id, { storage });
    expect((await db.select().from(statements).where(eq(statements.id, statement!.id)))[0]!.status).toBe("needs_review");
  });

  it("confirms statements", async () => {
    const [first] = await db.select().from(statements).where(eq(statements.householdId, householdId)).limit(1);
    expect(await confirmStatement(db, householdId, first!.id)).toBe(true);
    const rows = await db.select().from(transactions).where(eq(transactions.statementId, first!.id));
    expect(rows.every((r) => r.isConfirmed)).toBe(true);
  });
});

describe("ensureAuthUser (Supabase Auth → app user)", () => {
  it("creates users with the auth id, and links users created before Supabase Auth by email", async () => {
    const db = await createDb({ dataDir: "memory", url: "" });
    const authId = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

    const created = await ensureAuthUser(db, { id: authId, email: "New@Example.com", displayName: "Nora" });
    expect(created).toMatchObject({ id: authId, email: "new@example.com", displayName: "Nora" });
    expect((await ensureAuthUser(db, { id: authId, email: "new@example.com" })).displayName).toBe("Nora");

    const legacy = await findOrCreateUser(db, "old@example.com", "Olga");
    const linked = await ensureAuthUser(db, { id: "0b6f1c2a-3d4e-4f50-8a6b-7c8d9e0f1a2b", email: "old@example.com" });
    expect(linked.id).toBe(legacy.id);
  });
});

describe("household security", () => {
  it("only lets the invited email accept an invite", async () => {
    const db = await createDb({ dataDir: "memory", url: "" });
    const owner = await findOrCreateUser(db, "owner@example.com", "Owner");
    const intruder = await findOrCreateUser(db, "intruder@example.com", "Intruder");
    const invited = await findOrCreateUser(db, "Partner@Example.com", "Partner");
    const household = await createHousehold(db, owner.id, "Home");
    const invite = await createInvite(db, household.id, owner.id, "partner@example.com");

    await expect(acceptInvite(db, invite.token, intruder)).rejects.toMatchObject({ code: "invite_wrong_email" });
    await acceptInvite(db, invite.token, { ...invited, email: "Partner@Example.com" });
    expect((await getMembership(db, invited.id))?.household.id).toBe(household.id);
  });

  it("upgrades legacy unkeyed IBAN hashes to keyed ones", async () => {
    const db = await createDb({ dataDir: "memory", url: "" });
    const owner = await findOrCreateUser(db, "legacy@example.com", "Legacy");
    const household = await createHousehold(db, owner.id, "Home");
    const iban = "ES7614650100912345678901";
    const account = await createAccount(db, household.id, { bankId: SAMPLE_ACCOUNTS[0].bank, name: "Old", iban, owners: [{ userId: owner.id, sharePct: 100 }] });
    await db.update(accounts).set({ ibanHash: legacyIbanHash(household.id, iban) }).where(eq(accounts.id, account.id));

    expect(ibanHash(household.id, iban)).not.toBe(legacyIbanHash(household.id, iban));
    expect(await upgradeLegacyIbanHashes(db, household.id, [iban])).toBe(1);
    const [row] = await db.select().from(accounts).where(eq(accounts.id, account.id));
    expect(row!.ibanHash).toBe(ibanHash(household.id, iban));
  });
});
