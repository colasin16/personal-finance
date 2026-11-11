import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, gte } from "drizzle-orm";
import { asUser, createDb, schema, type Db } from "@/lib/db";
import { ensureDemoHousehold } from "@/lib/dev/demo";
import { createHousehold, findOrCreateUser } from "@/lib/households";
import { getVisibleAccounts } from "@/lib/queries";
import { SAMPLE_ACCOUNTS, SAMPLE_MONTHS, buildSampleStatements, renderSampleStatementPdf, sampleFileName } from "@/lib/dev/sample-statements";
import { processStatement } from "@/lib/pipeline/process-statement";
import { createStatementFromUpload } from "@/lib/pipeline/upload";
import {
  completeBankConnection,
  configureBankAccounts,
  getBankConnections,
  getBankSyncStatus,
  getSetupProposals,
  runDailyBankSync,
  startBankConnection,
  syncConnection,
  verifyAuthState,
} from "@/lib/bank-sync";
import { MockBankProvider } from "@/lib/services/bank-sync/mock";
import { setBankSyncProviderForTests } from "@/lib/services/bank-sync";
import type { FileStorage } from "@/lib/services/storage";

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

const { transactions, statements, bankConnections } = schema;
const NOW = new Date("2026-11-11T10:00:00Z");
const at = (days: number, hours = 0) => new Date(NOW.getTime() + days * 86_400_000 + hours * 3_600_000);

/** Bank sync with the offline mock provider: it only ever adds rows after the PDF coverage, and never touches PDF rows. */
describe("bank sync (PGlite + mock provider)", () => {
  let db: Db;
  const storage = new MemoryStorage();
  let clock = NOW;
  const provider = new MockBankProvider(() => clock);
  let householdId: string, alex: string, sam: string, eve: string;
  let alexIng: string, sharedIng: string;
  let connectionId: string;
  let syncFrom: string;
  let statementRowsBefore: unknown[];

  const statementRows = (accountId: string) =>
    db
      .select({ id: transactions.id, bookedAt: transactions.bookedAt, amountCents: transactions.amountCents, categoryId: transactions.categoryId, description: transactions.descriptionRaw })
      .from(transactions)
      .where(and(eq(transactions.accountId, accountId), eq(transactions.source, "statement")))
      .orderBy(transactions.id);
  const bankRows = (accountId: string) =>
    db.select().from(transactions).where(and(eq(transactions.accountId, accountId), eq(transactions.source, "bank")));

  beforeAll(async () => {
    setBankSyncProviderForTests(provider);
    db = await createDb({ dataDir: "memory", url: "" });
    const demo = await ensureDemoHousehold(db, { storage });
    ({ householdId } = demo);
    alex = demo.alex.id;
    sam = demo.sam.id;
    eve = (await findOrCreateUser(db, "eve@example.com", "Eve")).id;
    await createHousehold(db, eve, "Eve");
    const visible = await getVisibleAccounts(db, householdId, alex);
    alexIng = visible.find((a) => a.name === SAMPLE_ACCOUNTS[0]!.name)!.id;
    sharedIng = visible.find((a) => a.name === SAMPLE_ACCOUNTS[2]!.name)!.id;
    statementRowsBefore = await statementRows(alexIng);
  });
  afterAll(() => setBankSyncProviderForTests(null));

  it("connects through the consent redirect and matches accounts by IBAN", async () => {
    const { url } = await startBankConnection(db, { householdId, userId: alex, origin: "http://localhost" }, { bankName: "ING", bankCountry: "ES" }, provider, NOW);
    const params = new URL(url).searchParams;
    const state = verifyAuthState(params.get("state"))!;
    expect(state).toMatchObject({ householdId, userId: alex, bankName: "ING" });
    expect(verifyAuthState(`${params.get("state")}x`)).toBeNull();
    connectionId = await completeBankConnection(db, state, params.get("grant")!, provider);

    const [connection] = await getBankConnections(db, householdId, NOW);
    expect(connection!.bankId).toBe("ing");
    const setup = await getSetupProposals(db, householdId, connection!, NOW);
    expect(setup.proposals.map((p) => p.accountId).sort()).toEqual([alexIng, sharedIng].sort());
    expect(setup.proposals.every((p) => p.matched)).toBe(true);
    // Demo PDFs cover May–September, so syncing starts on October 1st.
    expect(setup.minByAccount[alexIng]).toBe("2026-10-01");
    syncFrom = setup.minByAccount[alexIng]!;
  });

  it("refuses a start date inside PDF-covered months", async () => {
    const [connection] = await getBankConnections(db, householdId, NOW);
    const link = connection!.accounts[0]!;
    await expect(configureBankAccounts(db, { householdId, userId: alex }, connectionId, [{ linkId: link.id, accountId: link.accountId ?? alexIng, syncFrom: "2026-09-15" }], NOW)).rejects.toMatchObject({
      code: "bank_sync_from_too_early",
    });
    await expect(configureBankAccounts(db, { householdId, userId: sam }, connectionId, [], NOW)).rejects.toMatchObject({ code: "bank_connection_not_yours" });
  });

  it("imports only booked rows from the start date, without touching PDF rows", async () => {
    const [connection] = await getBankConnections(db, householdId, NOW);
    const setup = await getSetupProposals(db, householdId, connection!, NOW);
    await configureBankAccounts(db, { householdId, userId: alex }, connectionId, setup.proposals.map((p) => ({ linkId: p.linkId, accountId: p.accountId, syncFrom: p.syncFrom })), NOW);

    const result = await syncConnection(db, connectionId, "initial", { provider, now: NOW });
    expect(result.status).toBe("synced");
    expect(result.inserted).toBeGreaterThan(0);
    const rows = await bankRows(alexIng);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.bookedAt >= syncFrom && r.bookedAt < "2026-11-11")).toBe(true);
    expect(rows.some((r) => r.bookedAt === "2026-10-28" && r.amountCents === 240_000)).toBe(true);
    expect(await statementRows(alexIng)).toEqual(statementRowsBefore);

    const status = await getBankSyncStatus(db, householdId, alex, NOW);
    expect(status).toMatchObject({ ownActiveIds: [connectionId], stale: [] });
    expect((await getBankSyncStatus(db, householdId, sam, NOW))!.ownActiveIds).toEqual([]);
  });

  it("re-syncs without duplicates and keeps the user's edits to synced rows", async () => {
    const [edited] = await bankRows(alexIng);
    await db.update(transactions).set({ excludedAt: NOW, categoryId: null }).where(eq(transactions.id, edited!.id));

    clock = at(0, 2);
    expect((await syncConnection(db, connectionId, "manual", { provider, now: clock })).inserted).toBe(0);
    clock = at(1);
    const nextDay = await syncConnection(db, connectionId, "cron", { provider, now: clock });
    expect(nextDay.status).toBe("synced");
    // Only the day that went from pending to booked can be new.
    expect((await bankRows(alexIng)).every((r) => r.bookedAt <= "2026-11-11")).toBe(true);
    const [after] = await db.select().from(transactions).where(eq(transactions.id, edited!.id));
    expect(after!.excludedAt).not.toBeNull();
    expect(after!.categoryId).toBeNull();
    expect(await statementRows(alexIng)).toEqual(statementRowsBefore);
  });

  it("stops after the daily access limit", async () => {
    clock = at(2);
    for (let i = 0; i < 3; i++) expect((await syncConnection(db, connectionId, "manual", { provider, now: clock })).status).toBe("synced");
    expect((await syncConnection(db, connectionId, "manual", { provider, now: clock })).status).toBe("limit");
  });

  it("leaves bank-covered rows out of a later PDF statement", async () => {
    const october = buildSampleStatements([SAMPLE_MONTHS.at(-1)!]).find((s) => s.account.key === "alex-ing")!;
    const bytes = await renderSampleStatementPdf(october);
    const { statement } = await createStatementFromUpload(db, { householdId, userId: alex, fileName: sampleFileName(october), bytes }, storage);
    await processStatement(db, statement.id, { storage });
    const [processed] = await db.select().from(statements).where(eq(statements.id, statement.id));
    expect(processed!.detected?.skippedBankSynced).toBe(october.rows.length);
    expect(await db.select().from(transactions).where(and(eq(transactions.statementId, statement.id), gte(transactions.bookedAt, syncFrom)))).toEqual([]);
  });

  it("marks the connection expired once consent ends and reports it as stale", async () => {
    const later = at(200);
    const reminders: number[] = [];
    const summary = await runDailyBankSync(db, { now: later, provider, sendReminder: async (e) => void reminders.push(e.reminder) });
    expect(summary.expired).toBe(1);
    const [connection] = await db.select().from(bankConnections).where(eq(bankConnections.id, connectionId));
    expect(connection!.status).toBe("expired");
    expect((await getBankSyncStatus(db, householdId, alex, later))!.stale).toHaveLength(1);
    expect((await syncConnection(db, connectionId, "manual", { provider, now: later })).status).toBe("inactive");
  });

  it("keeps connections private to the household and editable only by their creator", async () => {
    expect(await asUser(db, eve).select().from(bankConnections)).toEqual([]);
    expect(await asUser(db, eve).select().from(schema.bankConnectionAccounts)).toEqual([]);
    expect(await asUser(db, sam).select({ id: bankConnections.id }).from(bankConnections)).toEqual([{ id: connectionId }]);
    await asUser(db, sam).delete(bankConnections).where(eq(bankConnections.id, connectionId));
    await asUser(db, sam).update(bankConnections).set({ bankName: "Hacked" }).where(eq(bankConnections.id, connectionId));
    const [connection] = await db.select().from(bankConnections).where(eq(bankConnections.id, connectionId));
    expect(connection!.bankName).toBe("ING");
  });
});
