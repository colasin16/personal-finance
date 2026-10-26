/** Official website of each seeded bank (see `BANKS` in db/seed.ts), used to look up its logo. */
export const BANK_DOMAINS: Record<string, string> = {
  ing: "ing.com",
  bbva: "bbva.es",
  santander: "bancosantander.es",
  caixabank: "caixabank.es",
  sabadell: "bancsabadell.com",
  bankinter: "bankinter.com",
  openbank: "openbank.es",
  unicaja: "unicajabanco.es",
  kutxabank: "kutxabank.es",
  abanca: "abanca.com",
  revolut: "revolut.com",
  n26: "n26.com",
  wise: "wise.com",
  myinvestor: "myinvestor.es",
};

export const BRANDFETCH_CLIENT_ID =
  process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID;

export type BankLogoType = "symbol" | "icon" | "logo" | "none";

export const DEFAULT_BANK_LOGO_TYPE: BankLogoType = "symbol";

/** Preferred Brandfetch logo type per bank domain (not every brand has every type). Edit entries one by one. */
export const BANK_LOGO_TYPES: Record<string, BankLogoType> = {
  "ing.com": "symbol",
  "bbva.es": "none",
  "bancosantander.es": "none",
  "caixabank.es": "symbol",
  "bancsabadell.com": "none",
  "bankinter.com": "none",
  "openbank.es": "logo",
  "unicajabanco.es": "none",
  "kutxabank.es": "none",
  "abanca.com": "logo",
  "revolut.com": "none",
  "n26.com": "none",
  "wise.com": "none",
  "myinvestor.es": "none",
};

/** Preferred logo type for a bank, based on its domain. */
export function bankLogoType(bankId: string): BankLogoType {
  const domain = BANK_DOMAINS[bankId];
  return (domain && BANK_LOGO_TYPES[domain]) || DEFAULT_BANK_LOGO_TYPE;
}

/**
 * Brandfetch Logo API URL. Brandfetch requires hotlinking (embed in <img>, never download or proxy),
 * so this must only be used as an <img src>. Returns null without a client ID or a known domain.
 */
export function bankLogoUrl(
  bankId: string,
  sizePx: number,
  type: BankLogoType = bankLogoType(bankId),
): string | null {
  const domain = BANK_DOMAINS[bankId];
  if (!BRANDFETCH_CLIENT_ID || !domain) return null;
  const px = sizePx * 2; // retina
  return `https://cdn.brandfetch.io/domain/${domain}/w/${px}/h/${px}${type === "none" ? "" : "/" + type}?c=${encodeURIComponent(BRANDFETCH_CLIENT_ID)}`;
}
