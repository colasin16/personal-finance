import { UserError } from "@/lib/errors";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { accounts, banks, statements, transactions, type DetectedStatementInfo } from "@/lib/db/schema";
import { compactIban, findIbans, redactSensitive } from "@/lib/domain/redact";
import { normalizeDescription, normalizeMerchant, sha256, transactionFingerprint, withOrdinals } from "@/lib/domain/text";
import { fillRunningBalances, validateStatement } from "@/lib/domain/validation";
import { getLlm, type LlmProvider } from "@/lib/services/llm";
import { getStorage, type FileStorage } from "@/lib/services/storage";
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

type Deps = { storage?: FileStorage; llm?: LlmProvider };

/**
 * The statement pipeline: read PDF → detect bank/account → redact → extract (LLM or offline parser)
 * → validate balances → dedupe → categorize → link transfers → ready for review.
 */
export async function processStatement(db: Db, statementId: string, deps: Deps = {}) {
  const storage = deps.storage ?? getStorage();
  const llm = deps.llm ?? getLlm();
  const [statement] = await db.select().from(statements).where(eq(statements.id, statementId));
  if (!statement || statement.status === "confirmed") return;

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
    const bankId = await detectBank(db, text);
    const ibans = findIbans(text);
    const hashes = ibans.map((iban) => ibanHash(statement.householdId, iban));
    let accountId = statement.accountId;
    if (!accountId && hashes.length > 0) {
      const [match] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.householdId, statement.householdId), inArray(accounts.ibanHash, hashes)));
      accountId = match?.id ?? null;
    }
    const detected: DetectedStatementInfo = {
      bankId,
      ibanLast4: ibans[0]?.slice(-4) ?? null,
      ibanHash: hashes[0] ?? null,
      pageCount,
      provider: llm.name,
    };
    if (!accountId) {
      await db
        .update(statements)
        .set({ status: "needs_account", progress: null, detected })
        .where(eq(statements.id, statementId));
      return;
    }
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (!account) throw new UserError("account_not_found");

    await setProgress("extracting");
    const extracted = await llm.extractStatement(redactSensitive(text));
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
    await categorizeTransactions(db, statement.householdId, inserted.map((r) => r.id), llm);
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
        parserVersion: llm.name,
      })
      .where(eq(statements.id, statementId));
  } catch (error) {
    console.error(`[pipeline] statement ${statementId} failed`, error);
    await db
      .update(statements)
      .set({ status: "failed", progress: null, error: error instanceof UserError ? error.code : error instanceof Error ? error.message : String(error) })
      .where(eq(statements.id, statementId));
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
