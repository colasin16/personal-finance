import { UserError } from "@/lib/errors";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { accounts, banks, statements, transactions, type DetectedStatementInfo } from "@/lib/db/schema";
import { findSectionIbans, selectAccountText } from "@/lib/domain/sections";
import { compactIban, findIbans, redactSensitive } from "@/lib/domain/redact";
import { normalizeDescription, normalizeMerchant, sha256, transactionFingerprint, withOrdinals } from "@/lib/domain/text";
import { fillRunningBalances, validateStatement } from "@/lib/domain/validation";
import { getStorage, type FileStorage } from "@/lib/services/storage";
import { parseStatement, selectParser } from "@/lib/parsers";
import { autoLinkTransfers, categorizeTransactions } from "./categorize";
import { extractPdfText } from "./extract-text";

export const MIN_TEXT_CHARS = 40;

export function ibanHash(householdId: string, iban: string) {
  return sha256(`${householdId}:${compactIban(iban)}`);
}

async function detectBank(db: Db, text: string): Promise<string | null> {
  const upper = normalizeDescription(text);
  const all = await db.select({ id: banks.id, keywords: banks.detectKeywords }).from(banks);
  return all.find((b) => b.keywords.some((k) => upper.includes(normalizeDescription(k))))?.id ?? null;
}

type Deps = { storage?: FileStorage };

/** One PDF can cover several accounts: each gets its own statement row sharing the same file. */
async function createSiblingStatements(
  db: Db,
  statement: typeof statements.$inferSelect,
  sections: { iban: string; hash: string }[],
  primaryHash: string | null,
  accountByHash: Map<string, string>,
  info: Pick<DetectedStatementInfo, "bankId" | "pageCount">,
): Promise<string[]> {
  const existing = await db
    .select({ accountId: statements.accountId, detected: statements.detected })
    .from(statements)
    .where(and(eq(statements.householdId, statement.householdId), eq(statements.fileSha256, statement.fileSha256)));
  const created: string[] = [];
  for (const { iban, hash } of sections) {
    if (hash === primaryHash) continue;
    const accountId = accountByHash.get(hash) ?? null;
    if (existing.some((s) => (accountId ? s.accountId === accountId : s.accountId === null && s.detected?.ibanHash === hash))) continue;
    const [sibling] = await db
      .insert(statements)
      .values({
        householdId: statement.householdId,
        accountId,
        uploadedBy: statement.uploadedBy,
        fileName: statement.fileName,
        filePath: statement.filePath,
        fileSha256: statement.fileSha256,
        status: accountId ? "uploaded" : "needs_account",
        detected: { ...info, ibanLast4: iban.slice(-4), ibanHash: hash },
      })
      .returning({ id: statements.id });
    if (accountId) created.push(sibling!.id);
  }
  return created;
}

/**
 * The statement pipeline: read PDF → detect bank/account → redact → extract (bank parser)
 * → validate balances → dedupe → categorize → link transfers → ready for review.
 */
export async function processStatement(db: Db, statementId: string, deps: Deps = {}) {
  const siblingIds = await processSingleStatement(db, statementId, deps);
  for (const id of siblingIds) await processStatement(db, id, deps);
}

/** Processes one statement row and returns the ids of new sibling statements (other accounts in the same PDF). */
async function processSingleStatement(db: Db, statementId: string, deps: Deps): Promise<string[]> {
  const storage = deps.storage ?? getStorage();
  const [statement] = await db.select().from(statements).where(eq(statements.id, statementId));
  if (!statement || statement.status === "confirmed") return [];

  const setProgress = (progress: string) =>
    db.update(statements).set({ status: "processing", progress, error: null }).where(eq(statements.id, statementId));

  try {
    await setProgress("reading_pdf");
    const bytes = await storage.get(statement.filePath);
    const { text, pageCount, charCount } = await extractPdfText(bytes);
    if (charCount < MIN_TEXT_CHARS) {
      throw new UserError("pdf_no_text");
    }

    await setProgress("detecting");
    // A recognised layout beats keyword detection, which a transfer to another bank can fool.
    const keywordBankId = await detectBank(db, text);
    const parser = selectParser(text, keywordBankId);
    const bankId = parser?.bankId ?? keywordBankId;
    const sectionIbans = parser?.accountIbans ? parser.accountIbans(text) : findSectionIbans(text);
    const ibans = sectionIbans.length > 0 ? sectionIbans : findIbans(text);
    const hashes = ibans.map((iban) => ibanHash(statement.householdId, iban));
    const knownAccounts = hashes.length
      ? await db
          .select({ id: accounts.id, ibanHash: accounts.ibanHash })
          .from(accounts)
          .where(and(eq(accounts.householdId, statement.householdId), inArray(accounts.ibanHash, hashes)))
      : [];
    const accountByHash = new Map(knownAccounts.map((a) => [a.ibanHash!, a.id]));
    const [assigned] = statement.accountId ? await db.select().from(accounts).where(eq(accounts.id, statement.accountId)) : [];
    // The section this statement covers: its account's own IBAN, else the first one found.
    const primaryIndex = Math.max(0, hashes.findIndex((h) => (assigned ? h === assigned.ibanHash : accountByHash.has(h))));
    const accountId = statement.accountId ?? accountByHash.get(hashes[primaryIndex] ?? "") ?? null;
    const detected: DetectedStatementInfo = {
      bankId,
      ibanLast4: ibans[primaryIndex]?.slice(-4) ?? null,
      ibanHash: hashes[primaryIndex] ?? null,
      pageCount,
    };
    const siblings =
      sectionIbans.length > 1
        ? await createSiblingStatements(
            db,
            statement,
            sectionIbans.map((iban, i) => ({ iban, hash: hashes[i]! })),
            hashes[primaryIndex] ?? null,
            accountByHash,
            { bankId, pageCount },
          )
        : [];
    if (!accountId) {
      await db
        .update(statements)
        .set({ status: "needs_account", progress: null, detected })
        .where(eq(statements.id, statementId));
      return siblings;
    }
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (!account) throw new UserError("account_not_found");

    await setProgress("extracting");
    const accountText =
      account.ibanHash && !parser?.accountIbans
        ? selectAccountText(text, (iban) => ibanHash(statement.householdId, iban) === account.ibanHash)
      : text;
    const extracted = parseStatement(redactSensitive(accountText), bankId);
    detected.provider = extracted.parser;
    const toCents = (n: number | null) => (n === null ? null : Math.round(n * 100));
    const opening = toCents(extracted.openingBalance);
    const closing = toCents(extracted.closingBalance);
    const rows = fillRunningBalances(
      opening,
      extracted.transactions.map((t) => ({
        bookedAt: t.date,
        valueDate: t.valueDate,
        description: t.description.trim(),
        amountCents: Math.round(t.amount * 100),
        balanceAfterCents: toCents(t.balanceAfter),
      })),
    );
    const issues = validateStatement({ openingBalanceCents: opening, closingBalanceCents: closing, transactions: rows });

    await setProgress("deduplicating");
    // Removed rows are kept so their fingerprints keep them out of the re-import.
    await db.delete(transactions).where(and(eq(transactions.statementId, statementId), isNull(transactions.excludedAt)));
    const values = withOrdinals(rows).map((row, position) => ({
      householdId: statement.householdId,
      accountId: account.id,
      statementId,
      bookedAt: row.bookedAt,
      valueDate: row.valueDate,
      descriptionRaw: row.description,
      merchant: normalizeMerchant(row.description),
      amountCents: row.amountCents,
      currency: extracted.currency ?? account.currency,
      balanceAfterCents: row.balanceAfterCents,
      position,
      fingerprint: transactionFingerprint({ accountId: account.id, ...row }),
    }));
    const inserted =
      values.length === 0
        ? []
        : await db.insert(transactions).values(values).onConflictDoNothing().returning({ id: transactions.id });
    detected.skippedDuplicates = values.length - inserted.length;

    await setProgress("categorizing");
    await categorizeTransactions(db, statement.householdId, inserted.map((r) => r.id));
    await autoLinkTransfers(db, statement.householdId);

    await db
      .update(statements)
      .set({
        accountId: account.id,
        status: "needs_review",
        progress: null,
        error: null,
        periodStart: extracted.periodStart,
        periodEnd: extracted.periodEnd,
        openingBalanceCents: opening,
        closingBalanceCents: closing,
        currency: extracted.currency ?? account.currency,
        issues,
        detected,
        parserVersion: extracted.parser,
      })
      .where(eq(statements.id, statementId));
    return siblings;
  } catch (error) {
    console.error(`[pipeline] statement ${statementId} failed`, error);
    await db
      .update(statements)
      .set({ status: "failed", progress: null, error: error instanceof UserError ? error.code : error instanceof Error ? error.message : String(error) })
      .where(eq(statements.id, statementId));
    return [];
  }
}

export async function confirmStatement(db: Db, householdId: string, statementId: string) {
  const [statement] = await db
    .update(statements)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(and(eq(statements.id, statementId), eq(statements.householdId, householdId), eq(statements.status, "needs_review")))
    .returning();
  if (!statement) return false;
  await db.update(transactions).set({ isConfirmed: true }).where(eq(transactions.statementId, statementId));
  return true;
}
