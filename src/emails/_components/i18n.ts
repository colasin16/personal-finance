import { createTranslator } from "next-intl";
// Relative imports: the React Email preview server (`pnpm email:dev`) doesn't know the `@/` alias.
import { DEFAULT_LOCALE, isLocale, type Locale } from "../../i18n/config";
import enEmails from "../../../messages/en/emails.json";
import esEmails from "../../../messages/es/emails.json";

const MESSAGES = {
  en: { emails: enEmails },
  es: { emails: esEmails },
} satisfies Record<Locale, unknown>;

/** Brand and domain name: never translated. */
export const EMAIL_APP_NAME = "Personal Finance Space";

export const emailLocale = (locale: unknown): Locale => (isLocale(locale) ? locale : DEFAULT_LOCALE);

/** Email copy lives in messages/<locale>/emails.json, like the rest of the app's copy. */
export function emailTranslator(locale: Locale) {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "emails" });
  return { t, appName: EMAIL_APP_NAME };
}
