import { findIbans } from "@/lib/domain/redact";
import { parseAmount } from "@/lib/money";
import { buildStatement, parseDate, toLines, type Row, type StatementParser } from "./common";

const AMOUNT = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;
const PERIOD_RE = /(\d{2}\.\d{2}\.\d{2}(?:\d{2})?)\D+?(\d{2}\.\d{2}\.\d{2}(?:\d{2})?)/;
const COLUMNS_RE = /\b(?:Data|Fecha)\s+Cla(?:u|ve)\s+concept[eo]\b.*\bValor\s+Saldo\b/i;
// "ddmm concept [±] amount ddmm ± balance [trailing columns]": the sign is its own cell, or glued to a truncated concept.
const ROW_RE = new RegExp(`^(\\d{4}) (.+?)(?: ([-+]))? (${AMOUNT}) (\\d{4}) ([-+]) (${AMOUNT})(?: .*)?$`);
const OPENING_ROW_RE = new RegExp(`^\\d{4} SALDO\\b.*? \\d{4} ([-+]) (${AMOUNT})(?: .*)?$`, "i");
const ACCOUNT_IBAN_RE = /^[A-Z]{2}\d{2}(?: ?\d{4}){5}\b/;
// Card numbers in "COMPRA TARJ." concepts, as printed (masked with X/*) or already redacted.
const CARD_RE = /\b\d{4}[A-Z*\d]{8}\d{4}\b|\[CARD[^\]]*\]/gi;

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

/**
 * Banco Sabadell: every page repeats a header (the period "dd.mm.yy … dd.mm.yy", the account IBAN and
 * the "Data / Clau concepte / Càrrec (-) / Abonament (+) / Valor / Saldo" columns). Rows are one line:
 * "ddmm concept ± amount ddmm ± balance", sometimes followed by extra columns we ignore. The first row,
 * "SALDO ANTERIOR", carries the opening balance; there's no closing line, so it's the last row's balance.
 */
export const sabadellParser: StatementParser = {
  bankId: "sabadell",
  matches: (text) => COLUMNS_RE.test(text) || (/bancsabadell\.com/i.test(text) && toLines(text).some((line) => ROW_RE.test(line))),
  accountIbans(text) {
    const found = new Set<string>();
    for (const line of toLines(text)) {
      const m = ACCOUNT_IBAN_RE.exec(line);
      const iban = m ? findIbans(m[0])[0] : undefined;
      if (iban) found.add(iban);
    }
    return [...found];
  },
  parse(text) {
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
      const description = row[2]!.replace(CARD_RE, " ").replace(/\s+/g, " ").trim();
      rows.push({
        date,
        valueDate: resolveDayMonth(row[5]!, date),
        description,
        amounts: [signed(row[3], row[4]!), signed(row[6], row[7]!)],
      });
    }

    const closing = rows.at(-1)?.amounts[1] ?? opening;
    return buildStatement(text, rows, { opening, closing, period });
  },
};
