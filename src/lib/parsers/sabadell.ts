import { findIbans } from "@/lib/domain/redact";
import { parseAmount } from "@/lib/money";
import { buildStatement, parseDate, toLines, type Period, type Row, type StatementParser } from "./common";

const AMOUNT = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;
const ACCOUNT_IBAN_RE = /^[A-Z]{2}\d{2}(?: ?\d{4}){5}\b/;
// Card numbers in "COMPRA TARJ." concepts, as printed (masked with X/*) or already redacted.
const CARD_RE = /\b\d{4}[A-Z*\d]{8}\d{4}\b|\[CARD[^\]]*\]/gi;

// Movements export (any period): "Data / Clau concepte / Càrrec (-) / Abonament (+) / Valor / Saldo".
const PERIOD_RE = /(\d{2}\.\d{2}\.\d{2}(?:\d{2})?)\D+?(\d{2}\.\d{2}\.\d{2}(?:\d{2})?)/;
const COLUMNS_RE = /\b(?:Data|Fecha)\s+Cla(?:u|ve)\s+concept[eo]\b.*\bValor\s+Saldo\b/i;
// "ddmm concept [±] amount ddmm ± balance [trailing columns]": the sign is its own cell, or glued to a truncated concept.
const ROW_RE = new RegExp(`^(\\d{4}) (.+?)(?: ([-+]))? (${AMOUNT}) (\\d{4}) ([-+]) (${AMOUNT})(?: .*)?$`);
const OPENING_ROW_RE = new RegExp(`^\\d{4} SALDO\\b.*? \\d{4} ([-+]) (${AMOUNT})(?: .*)?$`, "i");

// Monthly statement (one calendar month): "Data / Concepte / Valor / Import / Saldo".
const MONTHLY_COLUMNS_RE = /\b(?:Data|Fecha)\s+Concept[eo]\s+Valor\s+Import[e]?\s+Saldo\b/i;
const ISSUE_DATE_RE = /\b(\d{2}\.\d{2}\.\d{2}(?:\d{2})?)\b/;
// "ddmm concept [ddmm] amount D|H balance D|H": the debit/credit mark may be glued to the amount.
const MONTHLY_ROW_RE = new RegExp(`^(\\d{4}) (.+?)(?: (\\d{4}))? (${AMOUNT}) ?([A-Z])? (${AMOUNT}) ?([A-Z])?$`);
const MONTHLY_OPENING_ROW_RE = new RegExp(`^(\\d{4}) SALDO\\b\\D*? (${AMOUNT}) ?([A-Z])?$`, "i");

/** Resolves a "ddmm" date (no year) to the year that puts it closest to a reference ISO date. */
function resolveDayMonth(ddmm: string, reference: string): string | null {
  const year = Number(reference.slice(0, 4));
  const day = Number(ddmm.slice(0, 2));
  const month = Number(ddmm.slice(2, 4));
  const distance = (iso: string) => Math.abs(Date.parse(iso) - Date.parse(reference));
  return (
    [year - 1, year, year + 1]
      .map((y) => parseDate(`${day}/${month}/${y}`))
      .filter((iso): iso is string => iso !== null)
      .sort((a, b) => distance(a) - distance(b))[0] ?? null
  );
}

const signed = (sign: string | undefined, amount: string) => {
  const cents = parseAmount(amount)!;
  return sign === "-" ? -cents : cents;
};

/** Debit/credit marks: D (Deure/Debe) is negative, H (Haver/Haber) positive; others stay unsigned for the balance to settle. */
const marked = (mark: string | undefined, amount: string) => signed(mark?.toUpperCase() === "D" ? "-" : "+", amount);

const cleanConcept = (concept: string) => concept.replace(CARD_RE, " ").replace(/\s+/g, " ").trim();

function monthOf(iso: string): Period {
  const [year, month] = iso.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = iso.slice(0, 7);
  return { start: `${prefix}-01`, end: `${prefix}-${String(lastDay).padStart(2, "0")}` };
}

/**
 * Movements export: every page repeats a header (the period "dd.mm.yy … dd.mm.yy", the account IBAN and the
 * columns). Rows are one line: "ddmm concept ± amount ddmm ± balance", sometimes followed by extra columns we
 * ignore. The first row, "SALDO ANTERIOR", carries the opening balance; the closing one is the last row's balance.
 */
function parseMovements(text: string) {
  const lines = toLines(text);
  const periodMatch = lines.map((line) => (ROW_RE.test(line) ? null : PERIOD_RE.exec(line))).find(Boolean);
  const period = {
    start: periodMatch ? parseDate(periodMatch[1]!) : null,
    end: periodMatch ? parseDate(periodMatch[2]!) : null,
  };
  const reference = period.end ?? period.start ?? new Date().toISOString().slice(0, 10);

  let opening: number | null = null;
  const rows: Row[] = [];
  for (const line of lines) {
    const openingRow = OPENING_ROW_RE.exec(line);
    if (openingRow) {
      // Later pages may repeat it as a carry-over: only the first one is the opening balance.
      opening ??= signed(openingRow[1], openingRow[2]!);
      continue;
    }
    const row = ROW_RE.exec(line);
    const date = row ? resolveDayMonth(row[1]!, reference) : null;
    if (!row || !date) continue;
    rows.push({
      date,
      valueDate: resolveDayMonth(row[5]!, date),
      description: cleanConcept(row[2]!),
      amounts: [signed(row[3], row[4]!), signed(row[6], row[7]!)],
    });
  }

  const closing = rows.at(-1)?.amounts[1] ?? opening;
  return buildStatement(text, rows, { opening, closing, period });
}

/**
 * Monthly statement: covers one calendar month and has no period line, only the issue date
 * ("EN SABADELL,31.10.26") in the page header, which anchors the year of the "ddmm" dates. Rows are
 * "ddmm concept ddmm amount D|H balance D|H" (the value date may be glued to a long concept); the first
 * row, "SALDO ANTERIOR", has only the opening balance, and the closing one is the last row's balance.
 */
function parseMonthly(text: string) {
  const lines = toLines(text);
  const header = lines.slice(0, Math.max(0, lines.findIndex((line) => MONTHLY_COLUMNS_RE.test(line))));
  const issueMatch = header.map((line) => ISSUE_DATE_RE.exec(line)).find(Boolean);
  const reference = (issueMatch && parseDate(issueMatch[1]!)) ?? new Date().toISOString().slice(0, 10);

  let opening: number | null = null;
  let openingDate: string | null = null;
  const rows: Row[] = [];
  for (const line of lines) {
    const openingRow = MONTHLY_OPENING_ROW_RE.exec(line);
    if (openingRow) {
      if (opening === null) {
        opening = marked(openingRow[3], openingRow[2]!);
        openingDate = resolveDayMonth(openingRow[1]!, reference);
      }
      continue;
    }
    const row = MONTHLY_ROW_RE.exec(line);
    const date = row ? resolveDayMonth(row[1]!, reference) : null;
    if (!row || !date) continue;
    rows.push({
      date,
      valueDate: row[3] ? resolveDayMonth(row[3], date) : null,
      description: cleanConcept(row[2]!),
      amounts: [marked(row[5], row[4]!), marked(row[7], row[6]!)],
    });
  }

  const monthDate = rows.at(-1)?.date ?? openingDate;
  const period = monthDate ? monthOf(monthDate) : { start: null, end: null };
  const closing = rows.at(-1)?.amounts[1] ?? opening;
  return buildStatement(text, rows, { opening, closing, period });
}

/**
 * Banco Sabadell, in either of its layouts: the movements export for a custom period, or the monthly
 * account statement. Both repeat their header on every page and print the account IBAN in it.
 */
export const sabadellParser: StatementParser = {
  bankId: "sabadell",
  matches: (text) =>
    COLUMNS_RE.test(text) ||
    MONTHLY_COLUMNS_RE.test(text) ||
    (/bancsabadell\.com/i.test(text) && toLines(text).some((line) => ROW_RE.test(line))),
  accountIbans(text) {
    const found = new Set<string>();
    for (const line of toLines(text)) {
      const m = ACCOUNT_IBAN_RE.exec(line);
      const iban = m ? findIbans(m[0])[0] : undefined;
      if (iban) found.add(iban);
    }
    return [...found];
  },
  parse: (text) => (MONTHLY_COLUMNS_RE.test(text) ? parseMonthly(text) : parseMovements(text)),
};
