export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", es: "Español" };

/** Message files live in messages/<locale>/<namespace>.json. */
export const NAMESPACES = [
  "common",
  "shell",
  "auth",
  "dashboard",
  "accounts",
  "settings",
  "import",
  "statements",
  "transactions",
  "issues",
  "errors",
] as const;

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);

/** BCP-47 tag used for Intl date/number formatting. Money is always formatted es-ES (EUR). */
export const intlLocale = (locale: string) => (locale === "es" ? "es-ES" : "en-GB");

export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const lang = part.split(";")[0]!.trim().slice(0, 2).toLowerCase();
    if (isLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}
