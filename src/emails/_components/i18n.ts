import { createTranslator } from "next-intl";
// Relative imports: the React Email preview server (`pnpm email:dev`) doesn't know the `@/` alias.
import { DEFAULT_LOCALE, isLocale, type Locale } from "../../i18n/config";
import enCommon from "../../../messages/en/common.json";
import enEmails from "../../../messages/en/emails.json";
import esCommon from "../../../messages/es/common.json";
import esEmails from "../../../messages/es/emails.json";

const MESSAGES = {
  en: { common: enCommon, emails: enEmails },
  es: { common: esCommon, emails: esEmails },
} satisfies Record<Locale, unknown>;

export const emailLocale = (locale: unknown): Locale => (isLocale(locale) ? locale : DEFAULT_LOCALE);

/** Email copy lives in messages/<locale>/emails.json, like the rest of the app's copy. */
export function emailTranslator(locale: Locale) {
  const messages = MESSAGES[locale];
  const t = createTranslator({ locale, messages, namespace: "emails" });
  return { t, appName: messages.common.appName };
}
