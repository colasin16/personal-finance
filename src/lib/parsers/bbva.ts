import { buildStatement, lastAmount, OPENING_RE, parseDate, parseRow, toLines, type Row, type StatementParser } from "./common";

const ISSUE_DATE_RE = /fecha\s+de\s+emisi[oó]n\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i;
const COLUMNS_RE = /\bF\.\s*Oper\.?\s+F\.\s*Valor\b/i;
// Card / reference numbers in detail lines (optionally after a one-letter marker), raw or already redacted.
const REFERENCE_RE = /(?:\b[A-Z]\s+)?(?:\b\d{12,}\b|\b\d{4}-\d{4}-\d{2}-\d{10}\b|\[CARD[^\]]*\])/g;

/**
 * BBVA: every page repeats a header ("Fecha de emisión: dd/mm/yyyy", "IBAN ES…", the
 * "F.Oper. F.Valor Concepto Importe Saldo" columns) and a "SALDO ANTERIOR" carry-over line.
 * Rows are "dd/mm dd/mm concept signed-amount balance", followed by detail lines (merchant,
 * card number…) and closed by a page footer (a "…:" label and a page total).
 */
export const bbvaParser: StatementParser = {
  bankId: "bbva",
  matches: (text) => COLUMNS_RE.test(text),
  parse(text) {
    const lines = toLines(text);
    const issued = lines.map((line) => ISSUE_DATE_RE.exec(line)).find(Boolean);
    const issueDate = issued ? parseDate(issued[1]!) : null;
    // Rows print no year: they fall within the year up to the issue date.
    const period = {
      start: issueDate ? `${Number(issueDate.slice(0, 4)) - 1}${issueDate.slice(4)}` : null,
      end: issueDate,
    };

    let opening: number | null = null;
    const rows: Row[] = [];
    let open: Row | null = null;
    for (const line of lines) {
      const row = parseRow(line, period);
      if (row) {
        rows.push(row);
        open = row;
      } else if (OPENING_RE.test(line)) {
        // Later pages repeat it as a carry-over: only the first one is the opening balance.
        opening ??= lastAmount(line) ?? null;
        open = null;
      } else if (COLUMNS_RE.test(line) || lastAmount(line) !== undefined || line.endsWith(":")) {
        open = null;
      } else if (open) {
        const detail = line.replace(REFERENCE_RE, " ").replace(/\s+/g, " ").trim();
        if (detail) open.description += ` ${detail}`;
      }
    }

    const closing = rows.at(-1)?.amounts[1] ?? opening;
    return buildStatement(text, rows, { opening, closing, period: { start: null, end: issueDate } });
  },
};
