import { findIbans } from "@/lib/domain/redact";
import { buildStatement, lastAmount, parseDate, trailingAmounts, type Row, type StatementParser } from "./common";

const DATE = String.raw`\d{2}\.\d{2}\.\d{4}`;
const PERIOD_RE = new RegExp(`^(${DATE}) \\S+ (${DATE})$`);
// "<description>   dd.mm.yyyy   ±9,99€": booking date and signed amount, no running balance.
const ROW_RE = new RegExp(`^(.+?) (${DATE}) (\\S+€)$`);
const VALUE_DATE_RE = new RegExp(`^Fecha de valor (${DATE})$`, "i");
const OPENING_RE = /^saldo\s+previo\b/i;
const CLOSING_RE = /\bnuevo\s+saldo\b/i;
// The page footer prints the account's own "IBAN:" after other columns; detail lines start with a counterparty "IBAN:".
const OWN_IBAN_RE = /\S\s{3,}IBAN:\s*([A-Z]{2}\d{2}[A-Z0-9 ]+)/;
const COUNTERPARTY_RE = /^(IBAN\b|\[IBAN)|\bBIC:/i;
const CELL_GAP_RE = /\s{3,}/;

/**
 * N26: "<description>   dd.mm.yyyy   ±amount€" rows, each followed by single-column detail lines
 * (card • category, counterparty IBAN/BIC, reference) and a closing "Fecha de valor dd.mm.yyyy".
 * A summary page holds "Saldo previo" and "Tu nuevo saldo"; every page ends with a multi-column footer.
 */
export const n26Parser: StatementParser = {
  bankId: "n26",
  matches: (text) => /\bNTSB[A-Z]{2}/.test(text) && text.split(/\r?\n/).some((line) => VALUE_DATE_RE.test(line.trim())),
  accountIbans(text) {
    const found = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const m = OWN_IBAN_RE.exec(line);
      const iban = m ? findIbans(m[1]!)[0] : undefined;
      if (iban) found.add(iban);
    }
    return [...found];
  },
  parse(text) {
    let period: { start: string | null; end: string | null } = { start: null, end: null };
    let opening: number | null = null;
    let closing: number | null = null;
    const rows: Row[] = [];
    let open: Row | null = null;

    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (!line) continue;
      const periodMatch = PERIOD_RE.exec(line);
      const row = ROW_RE.exec(line);
      const valueDate = VALUE_DATE_RE.exec(line);
      const amount = trailingAmounts(row ? [row[3]!] : []).amounts[0];

      if (periodMatch && !period.start) {
        period = { start: parseDate(periodMatch[1]!), end: parseDate(periodMatch[2]!) };
      } else if (row && amount !== undefined) {
        open = { date: parseDate(row[2]!)!, valueDate: null, description: row[1]!.trim(), amounts: [amount] };
        rows.push(open);
      } else if (valueDate) {
        if (open) open.valueDate = parseDate(valueDate[1]!);
        open = null;
      } else if (OPENING_RE.test(line)) {
        opening ??= lastAmount(line) ?? null;
      } else if (CLOSING_RE.test(line) && lastAmount(line) !== undefined) {
        closing = lastAmount(line)!;
      } else if (open && !CELL_GAP_RE.test(raw.trim())) {
        if (!COUNTERPARTY_RE.test(line)) open.description += ` ${line}`;
      } else {
        open = null;
      }
    }

    return buildStatement(text, rows, { opening, closing, period });
  },
};
