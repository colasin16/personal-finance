import { parseAmount } from "@/lib/money";
import type { ExtractedStatement, ExtractedTransaction } from "@/lib/services/llm/types";

/** A rule-based reader for one bank's statement layout. */
export type StatementParser = {
  bankId: string;
  /** True when the text has this bank's layout, so a wrongly detected bank can still be routed here. */
  matches(text: string): boolean;
  parse(text: string): ExtractedStatement;
  /**
   * The statement's own account IBAN(s), for layouts where "IBAN:" also labels counterparties.
   * When set, the pipeline uses it instead of the generic section headers and doesn't split the text.
   */
  accountIbans?(text: string): string[];
};

export type Period = { start: string | null; end: string | null };
export type Row = { date: string; valueDate: string | null; description: string; amounts: number[] };

const DATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$|^(\d{4})-(\d{2})-(\d{2})$/;
const SHORT_DATE_RE = /^(\d{1,2})\/(\d{1,2})$/;
const AMOUNT_RE = /^[-+\u2212(]?\d{1,3}(?:[.,']?\d{3})*[.,]\d{2}\)?-?$/;

export const OPENING_RE = /(saldo\s+(inicial|anterior)|opening\s+balance|balance\s+brought\s+forward|previous\s+balance)/i;
export const CLOSING_RE = /(saldo\s+(final|actual|al\s+cierre)|closing\s+balance|nuevo\s+saldo|new\s+balance)/i;

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

/** Resolves a "dd/mm" date (no year) to the year, within the statement period when known, that fits it. */
function parseShortDate(token: string, period: Period): string | null {
  const m = SHORT_DATE_RE.exec(token);
  if (!m || !period.start) return null;
  const [day, month] = [Number(m[1]), Number(m[2])];
  const startYear = Number(period.start.slice(0, 4));
  const endYear = Number((period.end ?? period.start).slice(0, 4));
  for (let year = startYear; year <= endYear; year++) {
    const iso = parseDate(`${day}/${month}/${year}`);
    if (iso && iso >= period.start && iso <= (period.end ?? "9999")) return iso;
  }
  return parseDate(`${day}/${month}/${startYear}`);
}

export const toLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** Pops up to two amounts (amount, balance) and any currency marks off the end of a line. */
export function trailingAmounts(tokens: string[]): { amounts: number[]; rest: string[] } {
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

export const lastAmount = (line: string) => trailingAmounts(line.split(" ")).amounts.at(-1);

/** Reads a "date [value date] description amount [balance]" line, or null when the line isn't one. */
export function parseRow(line: string, period: Period): Row | null {
  const tokens = line.split(" ");
  const date = parseDate(tokens[0] ?? "") ?? parseShortDate(tokens[0] ?? "", period);
  if (!date) return null;
  let rest = tokens.slice(1);
  const valueDate = parseDate(rest[0] ?? "") ?? parseShortDate(rest[0] ?? "", period);
  if (valueDate) rest = rest.slice(1);
  const { amounts, rest: descriptionTokens } = trailingAmounts(rest);
  const description = descriptionTokens.join(" ").trim();
  if (amounts.length === 0 || !description) return null;
  return { date, valueDate, description, amounts };
}

/** The common table layout: rows plus "saldo inicial/final" lines, which may also be dated rows. */
export function parseTable(text: string, period: Period): ExtractedStatement {
  let opening: number | null = null;
  let closing: number | null = null;
  const rows: Row[] = [];
  for (const line of toLines(text)) {
    const row = parseRow(line, period);
    const label = row?.description ?? line;
    const value = row ? row.amounts.at(-1) : lastAmount(line);
    if (OPENING_RE.test(label)) {
      if (value !== undefined) opening ??= value;
    } else if (CLOSING_RE.test(label)) {
      if (value !== undefined) closing = value;
    } else if (row) {
      rows.push(row);
    }
  }
  return buildStatement(text, rows, { opening, closing, period });
}

/** Turns rows into a statement, fixing unsigned amounts from the running balance. */
export function buildStatement(
  text: string,
  rows: Row[],
  { opening, closing, period }: { opening: number | null; closing: number | null; period: Period },
): ExtractedStatement {
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
    periodStart: period.start ?? dates[0] ?? null,
    periodEnd: period.end ?? dates.at(-1) ?? null,
    currency,
    openingBalance: opening === null ? null : opening / 100,
    closingBalance: closing === null ? null : closing / 100,
    transactions,
  };
}
