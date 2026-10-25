import { intlLocale } from "@/i18n/config";

/** Labels live in messages/<locale>/common.json under `accountTypes`, `statementStatus`, `categorizedBy`. */
export const ACCOUNT_TYPES = ["checking", "savings", "credit", "investment"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const STATEMENT_STATUSES = ["uploaded", "processing", "needs_account", "needs_review", "confirmed", "failed"] as const;
export type StatementStatus = (typeof STATEMENT_STATUSES)[number];
export const isStatementStatus = (s: string): s is StatementStatus => STATEMENT_STATUSES.includes(s as StatementStatus);

export const STATEMENT_STATUS_STYLE: Record<StatementStatus, string> = {
  uploaded: "bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-300",
  processing: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  needs_account: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  needs_review: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export const CATEGORIZED_BY = ["rule", "merchant", "llm", "user", "transfer"] as const;
export type CategorizedBy = (typeof CATEGORIZED_BY)[number];
export const isCategorizedBy = (s: string | null | undefined): s is CategorizedBy => CATEGORIZED_BY.includes(s as CategorizedBy);

/** Codes stored in statements.progress / transactions.flag_reason (older rows may hold English text). */
export const PROGRESS_CODES = ["queued", "reading_pdf", "detecting", "extracting", "deduplicating", "categorizing"] as const;
export const FLAG_CODES = ["low_confidence", "uncategorized"] as const;

export const formatMonth = (month: string, style: "short" | "long" = "short", locale = "en") =>
  new Date(`${month.slice(0, 7)}-01T00:00:00`).toLocaleDateString(intlLocale(locale), {
    month: style,
    year: style === "long" ? "numeric" : "2-digit",
  });

export const formatDate = (date: string, locale = "en") =>
  new Date(`${date}T00:00:00`).toLocaleDateString(intlLocale(locale), { day: "2-digit", month: "short", year: "numeric" });
