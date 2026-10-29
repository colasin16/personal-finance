const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g;
const CARD_RE = /\b(?:\d[ -]?){12,15}\d\b/g;
const SPANISH_ID_RE = /\b(?:\d{8}|[XYZ]\d{7})[A-Z]\b/g;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const PHONE_RE = /(?:\+\d{2}[ ]?)?\b[6789]\d{2}[ ]?\d{3}[ ]?\d{3}\b/g;

export function compactIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

export function findIbans(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.toUpperCase().matchAll(IBAN_RE)) {
    // The pattern can swallow a following word ("… 8901 SALDO"): drop trailing all-letter groups.
    const groups = match[0].split(/\s+/);
    while (groups.length > 1 && !/\d/.test(groups.at(-1)!)) groups.pop();
    let iban = compactIban(groups.join(""));
    if (iban.startsWith("ES")) iban = iban.slice(0, 24);
    if (iban.length >= 15 && iban.length <= 34 && /\d{8,}/.test(iban.slice(4))) found.add(iban);
  }
  return [...found];
}

export function maskIban(last4: string | null): string {
  return last4 ? `•••• ${last4}` : "—";
}

/** Removes personal identifiers before text leaves our infrastructure (e.g. to an LLM provider). */
export function redactSensitive(text: string): string {
  return text
    .replace(IBAN_RE, (m) => `[IBAN …${compactIban(m).slice(-4)}]`)
    .replace(EMAIL_RE, "[EMAIL]")
    .replace(CARD_RE, (m) => `[CARD …${m.replace(/\D/g, "").slice(-4)}]`)
    .replace(SPANISH_ID_RE, "[ID]")
    .replace(PHONE_RE, "[PHONE]");
}
