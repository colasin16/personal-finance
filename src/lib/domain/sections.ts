import { findIbans } from "./redact";

// "… - IBAN: ES…" (ING style) or a line starting "IBAN ES99 …" (BBVA style).
const IBAN_HEADER_RE = /IBAN\s*:|^\s*IBAN\s+[A-Z]{2}\d{2}/i;
const BULLET_RE = /^[•·▪]\s*/;
const PERIOD_HINT_RE = /saldo\s+inicial\s+a\s+\d{1,2}\/\d{1,2}\/\d{2,4}.*saldo\s+final\s+a\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i;

/** IBANs announced by "… - IBAN: ES…" product headers, in order of appearance (counterparty IBANs in rows are ignored). */
export function findSectionIbans(text: string): string[] {
  const found = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (IBAN_HEADER_RE.test(line)) for (const iban of findIbans(line).slice(0, 1)) found.add(iban);
  }
  return [...found];
}

/**
 * Some statements bundle several products (accounts, funds…) in one PDF, each under an
 * "<name> - IBAN: ES…" header and ended by the next header or a "• Section" bullet.
 * Returns only the lines of the sections whose IBAN passes `matches`, plus any line stating
 * the statement period. Text without IBAN headers is returned unchanged.
 */
export function selectAccountText(text: string, matches: (iban: string) => boolean): string {
  const lines = text.split(/\r?\n/);
  const headers = lines.flatMap((line, index) => (IBAN_HEADER_RE.test(line) && findIbans(line).length > 0 ? [index] : []));
  if (headers.length === 0) return text;
  // The same account repeated as a per-page header is a single-product statement.
  const headerIbans = new Set(headers.map((index) => findIbans(lines[index]!)[0]));
  if (headers.length > 1 && headerIbans.size === 1) return text;

  const selected = new Set<number>();
  const sections = headers.map((start) => {
    let end = start + 1;
    while (end < lines.length && !IBAN_HEADER_RE.test(lines[end]!) && !BULLET_RE.test(lines[end]!.trim())) end++;
    return { start, end, iban: findIbans(lines[start]!)[0]! };
  });
  // With no match (e.g. the account was picked manually) fall back to the first product.
  const chosen = sections.filter((s) => matches(s.iban));
  for (const s of chosen.length > 0 ? chosen : sections.slice(0, 1)) {
    for (let i = s.start; i < s.end; i++) selected.add(i);
  }
  lines.forEach((line, i) => {
    if (PERIOD_HINT_RE.test(line)) selected.add(i);
  });
  return lines.filter((_, i) => selected.has(i)).join("\n");
}
