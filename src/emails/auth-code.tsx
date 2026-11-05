import { Button, Heading, Text } from "react-email";
import type { Locale } from "../i18n/config";
import { EmailLayout, emailStyles } from "./_components/layout";
import { emailTranslator } from "./_components/i18n";

export type AuthCodeEmailProps = {
  locale: Locale;
  /** "signup": the first email to a new address. "signin": every later sign-in. */
  kind: "signup" | "signin";
  /** The one-time code typed into the sign-in form. */
  code: string;
  /** Link that confirms the same code in any browser (`/auth/confirm`). */
  url: string;
  email: string;
};

export function authCodeSubject({ locale, kind }: Pick<AuthCodeEmailProps, "locale" | "kind">) {
  const { t, appName } = emailTranslator(locale);
  return kind === "signup" ? t("authCode.subjectSignUp", { appName }) : t("authCode.subjectSignIn", { appName });
}

/** Sign-up confirmation and sign-in email: the code first, a button as a fallback. */
export default function AuthCodeEmail({ locale, kind, code, url, email }: AuthCodeEmailProps) {
  const { t, appName } = emailTranslator(locale);
  const signUp = kind === "signup";
  return (
    <EmailLayout
      lang={locale}
      appName={appName}
      preview={signUp ? t("authCode.previewSignUp") : t("authCode.previewSignIn")}
      footer={t("footer", { appName, email })}
    >
      <Heading as="h1" style={emailStyles.heading}>
        {signUp ? t("authCode.headingSignUp") : t("authCode.headingSignIn")}
      </Heading>
      <Text style={emailStyles.text}>{signUp ? t("authCode.introSignUp", { appName }) : t("authCode.introSignIn", { appName })}</Text>
      <Text
        style={{
          backgroundColor: emailStyles.colors.background,
          borderRadius: "8px",
          color: emailStyles.colors.text,
          fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
          fontSize: "30px",
          fontWeight: 700,
          letterSpacing: "6px",
          margin: "0 0 24px",
          padding: "14px 0",
          textAlign: "center",
        }}
      >
        {code}
      </Text>
      <Text style={emailStyles.muted}>{t("authCode.orButton")}</Text>
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
        {signUp ? t("authCode.buttonSignUp") : t("authCode.buttonSignIn")}
      </Button>
      <Text style={emailStyles.muted}>{t("authCode.expiry")}</Text>
      <Text style={{ ...emailStyles.muted, margin: 0 }}>{t("authCode.ignore")}</Text>
    </EmailLayout>
  );
}

AuthCodeEmail.PreviewProps = {
  locale: "en",
  kind: "signin",
  code: "12345678",
  url: "http://localhost:3000/auth/confirm?token_hash=preview&type=email",
  email: "alex@example.com",
} satisfies AuthCodeEmailProps;
