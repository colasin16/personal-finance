import { Button, Heading, Text } from "react-email";
import type { Locale } from "../i18n/config";
import { EmailLayout, emailStyles } from "./_components/layout";
import { emailTranslator } from "./_components/i18n";

export type BankConsentExpiringEmailProps = {
  locale: Locale;
  bankName: string;
  /** Whole days until bank access ends (14 or 3). */
  days: number;
  /** Settings → Bank connections, where the user reconnects. */
  url: string;
  email: string;
};

export function bankConsentExpiringSubject({ locale, bankName, days }: Pick<BankConsentExpiringEmailProps, "locale" | "bankName" | "days">) {
  const { t } = emailTranslator(locale);
  return t("bankConsent.subject", { bankName, days });
}

/** Sent 14 and 3 days before a bank's open banking consent ends. */
export default function BankConsentExpiringEmail({ locale, bankName, days, url, email }: BankConsentExpiringEmailProps) {
  const { t, appName } = emailTranslator(locale);
  return (
    <EmailLayout lang={locale} appName={appName} preview={t("bankConsent.preview", { bankName, days })} footer={t("footer", { appName, email })}>
      <Heading as="h1" style={emailStyles.heading}>
        {t("bankConsent.heading", { bankName })}
      </Heading>
      <Text style={emailStyles.text}>{t("bankConsent.intro", { bankName, days, appName })}</Text>
      <Button
        href={url}
        style={{
          backgroundColor: emailStyles.colors.text,
          borderRadius: "8px",
          color: "#ffffff",
          display: "block",
          fontSize: "15px",
          fontWeight: 600,
          margin: "0 0 24px",
          padding: "12px 20px",
          textAlign: "center",
        }}
      >
        {t("bankConsent.button")}
      </Button>
      <Text style={{ ...emailStyles.muted, margin: 0 }}>{t("bankConsent.why")}</Text>
    </EmailLayout>
  );
}

BankConsentExpiringEmail.PreviewProps = {
  locale: "en",
  bankName: "BBVA",
  days: 14,
  url: "http://localhost:3000/settings/bank-connections",
  email: "alex@example.com",
} satisfies BankConsentExpiringEmailProps;
