import { normalizeDescription, normalizeMerchant, sha256, transactionFingerprint, withOrdinals } from "./text";

/** PSD2 allows 4 unattended accesses per account per day; we keep one spare. */
export const MAX_DAILY_RUNS = 3;
/** Re-fetch this many days before the last synced booking date, to catch rows the bank books late. */
export const OVERLAP_DAYS = 7;
/** Longest consent we ask for; banks may grant less (BBVA: 90 days). */
export const MAX_CONSENT_DAYS = 180;
/** Expiry reminders, in days before the consent ends. */
export const REMINDER_DAYS = [14, 3] as const;

/** A transaction as the provider returns it (Enable Banking's shape, trimmed to what we use). */
export type ProviderTransaction = {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount: { currency: string; amount: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
  balance_after_transaction?: { currency?: string; amount: string } | null;
  bank_transaction_code?: { description?: string | null } | null;
};

export type BankRow = {
  bookedAt: string;
  valueDate: string | null;
  description: string;
  merchant: string;
  amountCents: number;
  balanceAfterCents: number | null;
  externalId: string | null;
};

export type SkipReason = "pending" | "currency" | "no_date" | "before_sync_from";

/** Parses a decimal string ("12.3", "-0.05") to cents without floating point rounding. */
export function decimalToCents(amount: string): number {
  const m = /^\s*([+-])?(\d*)(?:[.,](\d*))?\s*$/.exec(amount);
  if (!m || (!m[2] && !m[3])) throw new Error(`Invalid amount: ${amount}`);
  const cents = Number(m[2] || "0") * 100 + Number(((m[3] ?? "") + "00").slice(0, 2));
  return m[1] === "-" ? -cents : cents;
}

/** Maps one provider transaction to our row shape, or a reason it is skipped. */
export function toBankRow(tx: ProviderTransaction, currency = "EUR"): BankRow | { skip: SkipReason } {
  if (tx.status && tx.status !== "BOOK") return { skip: "pending" };
  if (tx.transaction_amount.currency !== currency) return { skip: "currency" };
  const bookedAt = tx.booking_date ?? tx.value_date ?? tx.transaction_date;
  if (!bookedAt) return { skip: "no_date" };
  const magnitude = Math.abs(decimalToCents(tx.transaction_amount.amount));
  const amountCents = tx.credit_debit_indicator === "DBIT" ? -magnitude : magnitude;
  const counterparty = (amountCents < 0 ? tx.creditor?.name : tx.debtor?.name)?.trim() || null;
  const remittance = (tx.remittance_information ?? []).map((s) => s.trim()).filter(Boolean).join(" ");
  const fallback = tx.bank_transaction_code?.description?.trim() || "—";
  const description =
    remittance && counterparty && !normalizeDescription(remittance).includes(normalizeDescription(counterparty))
      ? `${counterparty} ${remittance}`
      : remittance || counterparty || fallback;
  return {
    bookedAt: bookedAt.slice(0, 10),
    valueDate: tx.value_date?.slice(0, 10) ?? null,
    description,
    merchant: counterparty ? normalizeMerchant(counterparty) : normalizeMerchant(description),
    amountCents,
    balanceAfterCents: tx.balance_after_transaction ? decimalToCents(tx.balance_after_transaction.amount) : null,
    externalId: tx.entry_reference?.trim() || null,
  };
}

/**
 * Stable dedupe keys for synced rows. The bank's entry reference wins; otherwise the PDF-style fingerprint, with
 * ordinals counted per whole day (`rows` must hold complete days, which the date-bounded fetch guarantees).
 */
export function bankFingerprints<T extends BankRow>(accountId: string, rows: T[]): (T & { fingerprint: string })[] {
  const sorted = [...rows].sort((a, b) => a.bookedAt.localeCompare(b.bookedAt));
  return withOrdinals(sorted).map(({ ordinal, ...row }) => ({
    ...(row as unknown as T),
    fingerprint: row.externalId
      ? sha256(`bank|${accountId}|${row.externalId}`)
      : transactionFingerprint({ accountId, bookedAt: row.bookedAt, amountCents: row.amountCents, description: row.description, ordinal }),
  }));
}

export const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Earliest date bank sync may import for an account: the day after its PDF coverage, or null when it has none. */
export function minSyncFrom(coverage: { latestPeriodEnd: string | null; latestStatementTx: string | null }): string | null {
  const last = [coverage.latestPeriodEnd, coverage.latestStatementTx].filter((d): d is string => !!d).sort().at(-1);
  return last ? addDays(last, 1) : null;
}

/** The date range to fetch: from `syncFrom` (or a week before the last synced row) to today. */
export function syncWindow(input: { syncFrom: string; lastBankBookedAt: string | null; today: string }) {
  const overlap = input.lastBankBookedAt ? addDays(input.lastBankBookedAt, -OVERLAP_DAYS) : input.syncFrom;
  return { dateFrom: overlap > input.syncFrom ? overlap : input.syncFrom, dateTo: input.today };
}

/** The consent end date to request, capped by the bank's maximum validity. */
export function consentValidUntil(now: Date, maxConsentSeconds?: number | null): Date {
  const cap = MAX_CONSENT_DAYS * 86_400;
  const seconds = Math.min(cap, maxConsentSeconds && maxConsentSeconds > 0 ? maxConsentSeconds : cap);
  return new Date(now.getTime() + seconds * 1000);
}

/** Days left until the consent ends (rounded up), or null when unknown. */
export function daysLeft(validUntil: Date | null, now: Date): number | null {
  return validUntil ? Math.ceil((validUntil.getTime() - now.getTime()) / 86_400_000) : null;
}

/** The reminder to send now (14 or 3), if one is due and wasn't sent for this consent yet. */
export function dueReminder(validUntil: Date | null, now: Date, remindedDays: number | null): number | null {
  const left = daysLeft(validUntil, now);
  if (left === null || left <= 0) return null;
  const due = [...REMINDER_DAYS].sort((a, b) => a - b).find((d) => left <= d);
  if (due === undefined) return null;
  return remindedDays !== null && remindedDays <= due ? null : due;
}

/** Our account type for a provider cash account type (ISO 20022 codes). */
export function accountTypeFor(cashAccountType?: string | null): "checking" | "savings" | "credit" | "investment" {
  switch (cashAccountType) {
    case "SVGS":
    case "MOMA":
      return "savings";
    case "CARD":
    case "LOAN":
      return "credit";
    default:
      return "checking";
  }
}

/** Finds our `banks` id for a provider bank name ("BBVA", "Banco Santander", "ING"…); "other" when unknown. */
export function matchBankId(name: string, banks: { id: string; name: string; detectKeywords: string[] }[]): string {
  const n = normalizeDescription(name);
  const hit =
    banks.find((b) => b.id !== "other" && normalizeDescription(b.name) === n) ??
    banks.find((b) => b.id !== "other" && (n.includes(normalizeDescription(b.name)) || normalizeDescription(b.name).includes(n))) ??
    banks.find((b) => b.detectKeywords.some((k) => n.includes(normalizeDescription(k))));
  return hit?.id ?? "other";
}

/** Whether a PDF row must be left out because bank sync covers that date for its account. */
export function coveredByBank(bookedAt: string, cover: { syncFrom: string | null; bankRange: { min: string; max: string } | null }) {
  if (cover.syncFrom && bookedAt >= cover.syncFrom) return true;
  return !!cover.bankRange && bookedAt >= cover.bankRange.min && bookedAt <= cover.bankRange.max;
}
