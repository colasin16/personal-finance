import { Body, Container, Head, Html, Preview, Section, Text } from "react-email";

const colors = { brand: "#059669", text: "#18181b", muted: "#71717a", border: "#e4e4e7", background: "#f4f4f5" };

export const emailStyles = {
  colors,
  heading: { color: colors.text, fontSize: "22px", fontWeight: 600, lineHeight: "28px", margin: "0 0 12px" },
  text: { color: colors.text, fontSize: "15px", lineHeight: "24px", margin: "0 0 16px" },
  muted: { color: colors.muted, fontSize: "13px", lineHeight: "20px", margin: "0 0 8px" },
} as const;

/** The frame shared by every email: brand header, white card and footer. */
export function EmailLayout({
  lang,
  preview,
  appName,
  footer,
  children,
}: {
  lang: string;
  preview: string;
  appName: string;
  footer: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.background, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: "480px", margin: "0 auto", padding: "0 12px" }}>
          <Text style={{ color: colors.brand, fontSize: "16px", fontWeight: 700, margin: "0 0 16px", textAlign: "center" }}>{appName}</Text>
          <Section style={{ backgroundColor: "#ffffff", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "32px 28px" }}>{children}</Section>
          <Text style={{ ...emailStyles.muted, margin: "16px 0 0", textAlign: "center" }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
