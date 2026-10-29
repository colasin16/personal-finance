import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { householdMembers, statements } from "@/lib/db/schema";
import { createAccount, createHousehold, findOrCreateUser, getMembership } from "@/lib/households";
import { confirmStatement, processStatement } from "@/lib/pipeline/process-statement";
import { createStatementFromUpload } from "@/lib/pipeline/upload";
import type { FileStorage } from "@/lib/services/storage";
import { SAMPLE_ACCOUNTS, SAMPLE_MONTHS, buildSampleStatements, renderSampleStatementPdf, sampleFileName } from "./sample-statements";

export const DEMO_USERS = {
  alex: { email: "alex@demo.local", name: "Alex" },
  sam: { email: "sam@demo.local", name: "Sam" },
} as const;

/**
 * Creates the "Alex & Sam" demo household with three accounts and imports the sample statements
 * (all but the latest month, so the upload flow can be tried with `samples/*-2026-10.pdf`).
 */
export async function ensureDemoHousehold(db: Db, deps: { storage?: FileStorage } = {}) {
  const alex = await findOrCreateUser(db, DEMO_USERS.alex.email, DEMO_USERS.alex.name);
  const sam = await findOrCreateUser(db, DEMO_USERS.sam.email, DEMO_USERS.sam.name);
  const existing = await getMembership(db, alex.id);
  if (existing) return { alex, sam, householdId: existing.household.id, created: false };

  const household = await createHousehold(db, alex.id, "Alex & Sam");
  await db.insert(householdMembers).values({ householdId: household.id, userId: sam.id, role: "member" }).onConflictDoNothing();

  const ids = { alex: alex.id, sam: sam.id };
  const accountIds = new Map<string, string>();
  for (const sample of SAMPLE_ACCOUNTS) {
    const account = await createAccount(db, household.id, {
      bankId: sample.bank,
      name: sample.name,
      iban: sample.iban,
      owners: sample.owners.map((o) => ({ userId: ids[o], sharePct: 100 / sample.owners.length })),
    });
    accountIds.set(sample.key, account.id);
  }

  const months = SAMPLE_MONTHS.slice(0, -1);
  for (const statement of buildSampleStatements(months)) {
    const bytes = await renderSampleStatementPdf(statement);
    const uploader = statement.account.owners[0] === "sam" ? sam.id : alex.id;
    const { statement: row } = await createStatementFromUpload(
      db,
      { householdId: household.id, userId: uploader, fileName: sampleFileName(statement), bytes },
      deps.storage,
    );
    await processStatement(db, row.id, deps);
  }

  // Older months are already reviewed; the most recent ones are left for the user to review.
  const reviewed = new Set(months.slice(0, 3).map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`));
  const rows = await db.select().from(statements).where(eq(statements.householdId, household.id));
  for (const row of rows) {
    if (row.periodStart && reviewed.has(row.periodStart.slice(0, 7))) await confirmStatement(db, household.id, row.id);
  }
  return { alex, sam, householdId: household.id, created: true };
}
