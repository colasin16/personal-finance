import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { createDb, type Db } from "@/lib/db";
import { categories, statements, transactions } from "@/lib/db/schema";
import { SAMPLE_ACCOUNTS, SAMPLE_MONTHS, buildSampleStatements, renderSampleStatementPdf, sampleFileName } from "@/lib/dev/sample-statements";
import { acceptInvite, createAccount, createHousehold, createInvite, findOrCreateUser } from "@/lib/households";
import { processStatement, confirmStatement } from "@/lib/pipeline/process-statement";
import { createStatementFromUpload } from "@/lib/pipeline/upload";
import { applyRuleRetroactively, previewRule } from "@/lib/pipeline/categorize";
import { MockLlmProvider } from "@/lib/services/llm/mock";
import type { FileStorage } from "@/lib/services/storage";
import { categoryRules } from "@/lib/db/schema";

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
  const llm = new MockLlmProvider();
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
    await acceptInvite(db, invite.token, sam.id);
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
      await processStatement(db, statement.id, { storage, llm });
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
  });

  it("categorizes most transactions and flags the rest", async () => {
    const all = await db.select().from(transactions).where(eq(transactions.householdId, householdId));
    const uncategorized = all.filter((t) => t.categoryId === null);
    expect(uncategorized.length / all.length).toBeLessThan(0.25);
    expect(uncategorized.every((t) => t.flagged)).toBe(true);
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
  });

  it("confirms statements", async () => {
    const [first] = await db.select().from(statements).where(eq(statements.householdId, householdId)).limit(1);
    expect(await confirmStatement(db, householdId, first!.id)).toBe(true);
    const rows = await db.select().from(transactions).where(eq(transactions.statementId, first!.id));
    expect(rows.every((r) => r.isConfirmed)).toBe(true);
  });
});
