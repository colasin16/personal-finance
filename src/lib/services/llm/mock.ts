import { DEFAULT_CATEGORIES } from "@/lib/db/seed";
import { normalizeDescription } from "@/lib/domain/text";
import { parseAmount } from "@/lib/money";
import type {
  CategorizationInput,
  CategorizationResult,
  CategoryOption,
  ExtractedStatement,
  ExtractedTransaction,
  LlmProvider,
} from "./types";

const DATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$|^(\d{4})-(\d{2})-(\d{2})$/;
const AMOUNT_RE = /^[-+\u2212(]?\d{1,3}(?:[.,']?\d{3})*[.,]\d{2}\)?-?$/;

export function parseDate(token: string): string | null {
  const m = DATE_RE.exec(token.trim());
  if (!m) return null;
  let year: number, month: number, day: number;
  if (m[4]) {
    [year, month, day] = [Number(m[4]), Number(m[5]), Number(m[6])];
  } else {
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (year < 100) year += 2000;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const OPENING_RE = /(saldo\s+(inicial|anterior)|opening\s+balance|balance\s+brought\s+forward|previous\s+balance)/i;
const CLOSING_RE = /(saldo\s+(final|actual|al\s+cierre)|closing\s+balance|nuevo\s+saldo|new\s+balance)/i;
const PERIOD_RE =
  /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*(?:al|a|-|–|to|hasta)\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/i;

function trailingAmounts(tokens: string[]): { amounts: number[]; rest: string[] } {
  const amounts: number[] = [];
  const rest = [...tokens];
  while (rest.length > 0 && amounts.length < 2) {
    const raw = rest[rest.length - 1]!;
    if (raw === "€" || raw.toUpperCase() === "EUR") {
      rest.pop();
      continue;
    }
    const token = raw.replace(/(€|EUR)$/i, "");
    if (!AMOUNT_RE.test(token)) break;
    const cents = parseAmount(token);
    if (cents === null) break;
    amounts.unshift(cents);
    rest.pop();
  }
  return { amounts, rest };
}

/**
 * Offline, rule-based statement reader. It understands the common
 * "date [value date] description amount [balance]" table layout used by most European banks,
 * and is the default when no LLM API key is configured.
 */
export function parseStatementText(text: string): ExtractedStatement {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let opening: number | null = null;
  let closing: number | null = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  const rows: { date: string; valueDate: string | null; description: string; amounts: number[] }[] = [];

  for (const line of lines) {
    const tokens = line.split(" ");
    const firstDate = parseDate(tokens[0] ?? "");

    if (!firstDate) {
      const isOpening = OPENING_RE.test(line);
      if (isOpening || CLOSING_RE.test(line)) {
        const value = trailingAmounts(tokens).amounts.at(-1);
        if (value !== undefined) {
          if (isOpening) opening ??= value;
          else closing = value;
        }
      } else if (!periodStart && /(periodo|period|del |from|extracto|statement)/i.test(line)) {
        const period = PERIOD_RE.exec(line);
        if (period) {
          periodStart = parseDate(period[1]!);
          periodEnd = parseDate(period[2]!);
        }
      }
      continue;
    }

    let rest = tokens.slice(1);
    const valueDate = parseDate(rest[0] ?? "");
    if (valueDate) rest = rest.slice(1);
    const { amounts, rest: descriptionTokens } = trailingAmounts(rest);
    const description = descriptionTokens.join(" ").trim();
    if (amounts.length === 0 || !description) continue;
    if (OPENING_RE.test(description)) {
      opening ??= amounts.at(-1)!;
      continue;
    }
    if (CLOSING_RE.test(description)) {
      closing = amounts.at(-1)!;
      continue;
    }
    rows.push({ date: firstDate, valueDate, description, amounts });
  }

  let previousBalance = opening;
  const transactions: ExtractedTransaction[] = rows.map((row) => {
    let amountCents = row.amounts[0]!;
    const balanceCents = row.amounts.length > 1 ? row.amounts[1]! : null;
    // Banks that print unsigned debit amounts: infer the sign from the running balance.
    if (
      balanceCents !== null &&
      previousBalance !== null &&
      Math.abs(balanceCents - previousBalance) === Math.abs(amountCents)
    ) {
      amountCents = balanceCents - previousBalance;
    }
    previousBalance = balanceCents ?? (previousBalance !== null ? previousBalance + amountCents : null);
    return {
      date: row.date,
      valueDate: row.valueDate,
      description: row.description,
      amount: amountCents / 100,
      balanceAfter: balanceCents === null ? null : balanceCents / 100,
    };
  });

  const dates = transactions.map((t) => t.date).sort();
  const currency = /\bUSD\b|\$/.test(text) ? "USD" : /\bGBP\b|£/.test(text) ? "GBP" : "EUR";

  return {
    periodStart: periodStart ?? dates[0] ?? null,
    periodEnd: periodEnd ?? dates.at(-1) ?? null,
    currency,
    openingBalance: opening === null ? null : opening / 100,
    closingBalance: closing === null ? null : closing / 100,
    transactions,
  };
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const KEYWORD_MATCHERS = DEFAULT_CATEGORIES.flatMap((category) =>
  category.keywords.map((keyword) => ({
    slug: category.slug,
    // A trailing space in a seed keyword ("BAR ", "DIA ") means "whole word only".
    re: new RegExp(`(^|[^A-Z0-9])${escapeRegex(normalizeDescription(keyword))}${keyword.endsWith(" ") ? "($|[^A-Z0-9])" : ""}`),
  })),
);

export function keywordCategorize(item: CategorizationInput, categories: CategoryOption[]): CategorizationResult {
  const available = new Map(categories.map((c) => [c.slug, c]));
  const haystack = normalizeDescription(`${item.description} ${item.merchant ?? ""}`);
  const match = KEYWORD_MATCHERS.find((k) => available.has(k.slug) && k.re.test(haystack));
  if (match) {
    const kind = available.get(match.slug)!.kind;
    // An income keyword on an outgoing payment (or the reverse) is suspicious: lower confidence.
    const consistent = kind === "transfer" || (kind === "income") === item.amountCents > 0;
    return { id: item.id, categorySlug: match.slug, confidence: consistent ? 0.8 : 0.4 };
  }
  if (item.amountCents > 0 && available.has("other-income")) {
    return { id: item.id, categorySlug: "other-income", confidence: 0.5 };
  }
  return { id: item.id, categorySlug: null, confidence: 0 };
}

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock-heuristic";

  async extractStatement(text: string) {
    return parseStatementText(text);
  }

  async categorize(items: CategorizationInput[], categories: CategoryOption[]) {
    return items.map((item) => keywordCategorize(item, categories));
  }
}
