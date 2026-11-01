import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asUser, createDb, schema, type Db } from "@/lib/db";
import { ensureDemoHousehold } from "@/lib/dev/demo";
import { createAccount, createHousehold, createInvite, findOrCreateUser, getMembership, updateAccount } from "@/lib/households";
import { createStatementFromUpload } from "@/lib/pipeline/upload";
import { getCompleteness, getDashboard, getIssues, getVisibleAccounts, listStatements, listTransactions } from "@/lib/queries";
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

const PDF = new TextEncoder().encode("%PDF-1.4 test");

/** Row Level Security from drizzle/0006, as applied to the app's user-scoped connection (asUser). */
describe("row level security", () => {
  let db: Db;
  let alex: string, sam: string, eve: string;
  let householdId: string;
  let samPrivateId: string;

  beforeAll(async () => {
    db = await createDb({ dataDir: "memory", url: "" });
    const demo = await ensureDemoHousehold(db, { storage: new MemoryStorage() });
    ({ householdId } = demo);
    alex = demo.alex.id;
    sam = demo.sam.id;
    eve = (await findOrCreateUser(db, "eve@example.com", "Eve")).id;
    await createHousehold(db, eve, "Eve");
    // One of Sam's accounts is private, so Alex must not see it or its statements and transactions.
    const samOnly = (await getVisibleAccounts(db, householdId, sam)).find((a) => a.owners.length === 1 && a.owners[0]!.userId === sam)!;
    samPrivateId = samOnly.id;
    await db.update(schema.accounts).set({ isPrivate: true }).where(eq(schema.accounts.id, samPrivateId));
  });

  it("isolates households and hides private accounts from the partner", async () => {
    expect(await asUser(db, eve).select().from(schema.accounts)).toEqual([]);
    expect(await asUser(db, eve).select().from(schema.transactions)).toEqual([]);
    const alexAccounts = (await asUser(db, alex).select({ id: schema.accounts.id }).from(schema.accounts)).map((a) => a.id);
    const samAccounts = (await asUser(db, sam).select({ id: schema.accounts.id }).from(schema.accounts)).map((a) => a.id);
    expect(samAccounts).toContain(samPrivateId);
    expect(alexAccounts).not.toContain(samPrivateId);
    expect(await db.$count(schema.transactions, eq(schema.transactions.accountId, samPrivateId))).toBeGreaterThan(0);
    expect(await asUser(db, alex).$count(schema.transactions, eq(schema.transactions.accountId, samPrivateId))).toBe(0);
  });

  it("returns the same data to the app's queries as the privileged connection", async () => {
    for (const userId of [alex, sam]) {
      const userDb = asUser(db, userId);
      const visible = await getVisibleAccounts(db, householdId, userId, { includeArchived: true });
      const ids = visible.map((a) => a.id);
      expect(await getVisibleAccounts(userDb, householdId, userId, { includeArchived: true })).toEqual(visible);
      expect(await getDashboard(userDb, householdId, userId, "household", "12m")).toEqual(await getDashboard(db, householdId, userId, "household", "12m"));
      expect(await listTransactions(userDb, householdId, ids, { pageSize: 500 })).toEqual(await listTransactions(db, householdId, ids, { pageSize: 500 }));
      expect(await listStatements(userDb, householdId, userId, ids, { attention: true })).toEqual(await listStatements(db, householdId, userId, ids, { attention: true }));
      expect(await getCompleteness(userDb, householdId, visible)).toEqual(await getCompleteness(db, householdId, visible));
      expect(await getIssues(userDb, householdId, userId)).toEqual(await getIssues(db, householdId, userId));
      expect(await getMembership(userDb, userId)).toEqual(await getMembership(db, userId));
    }
  });

  it("stops a member from taking over a partner's private account", async () => {
    const asAlex = asUser(db, alex);
    await asAlex.update(schema.accounts).set({ isPrivate: false }).where(eq(schema.accounts.id, samPrivateId));
    await expect(asAlex.insert(schema.accountOwners).values({ accountId: samPrivateId, userId: alex, sharePct: 100 })).rejects.toThrow();
    const [row] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, samPrivateId));
    expect(row!.isPrivate).toBe(true);
  });

  it("lets members create and update shared and private accounts", async () => {
    const asAlex = asUser(db, alex);
    const owners = (share: Record<string, number>) => Object.entries(share).map(([userId, sharePct]) => ({ userId, sharePct }));
    const { id: privateId } = await createAccount(asAlex, householdId, { bankId: "ing", name: "Alex private", isPrivate: true, owners: owners({ [alex]: 100 }) });
    const { id: sharedId } = await createAccount(asAlex, householdId, { bankId: "ing", name: "Joint", owners: owners({ [alex]: 50, [sam]: 50 }) });
    expect((await getVisibleAccounts(asUser(db, sam), householdId, sam)).map((a) => a.id)).toContain(sharedId);
    expect((await getVisibleAccounts(asUser(db, sam), householdId, sam)).map((a) => a.id)).not.toContain(privateId);

    // Handing a private account over to the partner, and making a shared one private to the partner.
    await updateAccount(asAlex, householdId, privateId, { bankId: "ing", name: "Now Sam's", isPrivate: true, owners: owners({ [sam]: 100 }) });
    await updateAccount(asAlex, householdId, sharedId, { bankId: "ing", name: "Sam only", isPrivate: true, owners: owners({ [sam]: 100 }) });
    const samSees = await getVisibleAccounts(asUser(db, sam), householdId, sam);
    expect(samSees.filter((a) => a.id === privateId || a.id === sharedId).map((a) => a.name).sort()).toEqual(["Now Sam's", "Sam only"]);
    expect((await getVisibleAccounts(asAlex, householdId, alex)).map((a) => a.id)).not.toContain(privateId);
  });

  it("lets members edit what they can see", async () => {
    const asSam = asUser(db, sam);
    const [tx] = await asSam.select().from(schema.transactions).where(eq(schema.transactions.accountId, samPrivateId)).limit(1);
    const [category] = await asSam.insert(schema.categories).values({ householdId, slug: "rls-test", name: "RLS test", kind: "expense" }).returning();
    await asSam.update(schema.transactions).set({ categoryId: category!.id, categorizedBy: "user" }).where(eq(schema.transactions.id, tx!.id));
    await asSam.insert(schema.transactionChanges).values({ transactionId: tx!.id, userId: sam, field: "category", oldValue: tx!.categoryId, newValue: category!.id });
    await asSam.insert(schema.categoryRules).values({ householdId, matchType: "merchant", pattern: "rls", categoryId: category!.id }).returning();
    await asSam.insert(schema.dismissedSuggestions).values({ householdId, key: "merchant:rls" }).onConflictDoNothing();
    await asSam.update(schema.households).set({ name: "Renamed" }).where(eq(schema.households.id, householdId));
    expect((await db.select().from(schema.transactions).where(eq(schema.transactions.id, tx!.id)))[0]!.categoryId).toBe(category!.id);
    expect((await db.select().from(schema.households).where(eq(schema.households.id, householdId)))[0]!.name).toBe("Renamed");
    // Alex can't touch Sam's private transaction or log changes against it.
    const asAlex = asUser(db, alex);
    await asAlex.update(schema.transactions).set({ notes: "x" }).where(eq(schema.transactions.id, tx!.id));
    expect((await db.select().from(schema.transactions).where(eq(schema.transactions.id, tx!.id)))[0]!.notes).toBeNull();
    await expect(asAlex.insert(schema.transactionChanges).values({ transactionId: tx!.id, userId: alex, field: "notes" })).rejects.toThrow();
  });

  it("shows unassigned statements only to their uploader", async () => {
    const storage = new MemoryStorage();
    const { statement } = await createStatementFromUpload(asUser(db, alex), { householdId, userId: alex, fileName: "x.pdf", bytes: PDF }, storage);
    expect(await asUser(db, alex).select().from(schema.statements).where(eq(schema.statements.id, statement.id))).toHaveLength(1);
    expect(await asUser(db, sam).select().from(schema.statements).where(eq(schema.statements.id, statement.id))).toEqual([]);
    await asUser(db, sam).delete(schema.statements).where(eq(schema.statements.id, statement.id));
    expect(await db.select().from(schema.statements).where(eq(schema.statements.id, statement.id))).toHaveLength(1);
    // Nor can a statement be uploaded in someone else's name or into an account the uploader can't see.
    await expect(
      asUser(db, alex).insert(schema.statements).values({ householdId, accountId: samPrivateId, uploadedBy: alex, fileName: "y.pdf", filePath: "y", fileSha256: "y" }),
    ).rejects.toThrow();
  });

  it("lets only the owner invite, and keeps signed-out and other households' users out", async () => {
    await expect(createInvite(asUser(db, sam), householdId, sam, "friend@example.com")).rejects.toThrow();
    await createInvite(asUser(db, alex), householdId, alex, "friend@example.com");
    expect(await asUser(db, eve).select().from(schema.householdInvites)).toEqual([]);
    expect(await asUser(db, eve).select().from(schema.users).where(eq(schema.users.id, alex))).toEqual([]);
  });
});
