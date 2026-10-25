import { createHash } from "node:crypto";

export function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function normalizeDescription(description: string): string {
  return description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const MERCHANT_PREFIXES = [
  /^(COMPRA|PAGO)\s+(EN\s+|CON\s+)?(TARJETA|TARJ\.?|TJ)\s*(\d{4}\s*)?(EN\s+)?/,
  /^(COMPRA|PAGO)\s+EN\s+/,
  /^(TRANSFERENCIA|TRANSF\.?)\s+(RECIBIDA|EMITIDA|INMEDIATA|A FAVOR DE|DE)?\s*(DE\s+|A\s+)?/,
  /^(RECIBO|ADEUDO|DOMICILIACION|CARGO)\s+(DE\s+)?/,
  /^BIZUM\s+(DE|A|ENVIADO|RECIBIDO)\s*/,
  /^CARD PAYMENT( TO)?\s+/,
  /^DIRECT DEBIT\s+/,
];

/** Turns a raw statement description into a stable, human readable merchant name. */
export function normalizeMerchant(description: string): string {
  let s = normalizeDescription(description);
  for (const re of MERCHANT_PREFIXES) s = s.replace(re, "");
  s = s
    .replace(/\b\d{2}[/.-]\d{2}([/.-]\d{2,4})?\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\*+/g, " ")
    .replace(/\b(S\.?L\.?U?|S\.?A\.?U?)\b\.?/g, " ")
    .replace(/[^A-Z0-9&' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = s.split(" ").slice(0, 3).join(" ");
  if (!words) return titleCase(normalizeDescription(description));
  return titleCase(words);
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)([a-z])/g, (_, sp: string, c: string) => sp + c.toUpperCase());
}

export function transactionFingerprint(input: {
  accountId: string;
  bookedAt: string;
  amountCents: number;
  description: string;
  ordinal: number;
}): string {
  return sha256(
    [input.accountId, input.bookedAt, input.amountCents, normalizeDescription(input.description), input.ordinal].join("|"),
  );
}

/** Numbers identical (date, amount, description) rows so genuine repeats within a statement survive dedupe. */
export function withOrdinals<T extends { bookedAt: string; amountCents: number; description: string }>(
  rows: T[],
): (T & { ordinal: number })[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = `${row.bookedAt}|${row.amountCents}|${normalizeDescription(row.description)}`;
    const ordinal = seen.get(key) ?? 0;
    seen.set(key, ordinal + 1);
    return { ...row, ordinal };
  });
}
