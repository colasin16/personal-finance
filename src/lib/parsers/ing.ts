import { parseDate, parseTable, type StatementParser } from "./common";

// "Saldo Inicial a 01/09/2026 … Saldo final a 30/09/2026": the period, as rows only print "dd/mm".
const BALANCE_PERIOD_RE =
  /saldo\s+inicial\s+a\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}).*saldo\s+final\s+a\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i;

/**
 * ING: one or more products, each under a "<name> - IBAN: ES…" header (see `selectAccountText`),
 * with "dd/mm  dd/mm  concept  amount €  balance €" rows.
 */
export const ingParser: StatementParser = {
  bankId: "ing",
  matches: (text) => BALANCE_PERIOD_RE.test(text),
  parse(text) {
    const m = BALANCE_PERIOD_RE.exec(text);
    return parseTable(text, { start: m ? parseDate(m[1]!) : null, end: m ? parseDate(m[2]!) : null });
  },
};
