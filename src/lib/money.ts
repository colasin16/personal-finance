export type Cents = number;

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  cents: Cents,
  currency = "EUR",
  { locale = "es-ES", signed = false }: { locale?: string; signed?: boolean } = {},
): string {
  const key = `${locale}:${currency}:${signed}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      signDisplay: signed ? "exceptZero" : "auto",
      // es-ES only groups from 10.000 by default ("1000,00 €"); always group so every amount reads the same.
      useGrouping: "always",
    });
    formatters.set(key, fmt);
  }
  return fmt.format(cents / 100);
}

/**
 * Parses amounts as printed in bank statements into integer cents.
 * Supports "1.234,56", "1,234.56", "-12,00 €", "12,00-", "(12.00)", "−12,00" and "+5".
 */
export function parseAmount(input: string): Cents | null {
  let s = input.trim().replace(/[€$£\s\u00a0]|EUR|USD|GBP/gi, "");
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/\u2212/g, "-");
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^\d[\d.,']*$/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const decimalIdx = Math.max(lastComma, lastDot);
  const digitsAfter = decimalIdx === -1 ? 0 : s.length - decimalIdx - 1;
  const sepCount = (s.match(/[.,]/g) ?? []).length;

  let integerPart: string;
  let fractionPart = "";
  // A single separator followed by exactly 3 digits ("1.234") is a thousands separator.
  if (decimalIdx === -1 || digitsAfter > 2 || (digitsAfter === 3 && sepCount === 1)) {
    integerPart = s.replace(/[.,']/g, "");
  } else {
    integerPart = s.slice(0, decimalIdx).replace(/[.,']/g, "");
    fractionPart = s.slice(decimalIdx + 1);
  }

  const cents = Number(integerPart || "0") * 100 + Number((fractionPart + "00").slice(0, 2));
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

export function applyShare(cents: Cents, sharePct: number): Cents {
  const value = (cents * sharePct) / 100;
  return Math.sign(value) * Math.round(Math.abs(value));
}
