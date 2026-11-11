import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitch } from "@/components/theme/language-switch";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const CONTACT_EMAIL = "hola@personal-finance.space";
const LAST_UPDATED = new Date("2026-11-11");

const SECTIONS = {
  privacy: [
    "controller",
    "data",
    "purpose",
    "processors",
    "security",
    "retention",
    "rights",
    "cookies",
    "changes",
  ],
  terms: [
    "service",
    "account",
    "banks",
    "advice",
    "use",
    "liability",
    "termination",
    "law",
  ],
} as const;

export type LegalDoc = keyof typeof SECTIONS;
type SectionKey = {
  [D in LegalDoc]: `${D}.sections.${(typeof SECTIONS)[D][number]}`;
}[LegalDoc];

/** Public, signed-out page rendering the Privacy Policy or Terms of Service from the `legal` messages. */
export async function LegalPage({ doc }: { doc: LegalDoc }) {
  const t = await getTranslations("legal");
  const format = await getFormatter();
  const values = {
    appName: (await getTranslations("common"))("appName"),
    email: CONTACT_EMAIL,
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-4 sm:px-6">
          <Logo className="mr-auto" />
          <LanguageSwitch />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          {t(`${doc}.title`)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("lastUpdated", {
            date: format.dateTime(LAST_UPDATED, { dateStyle: "long" }),
          })}
        </p>
        <p className="mt-6 text-pretty">{t(`${doc}.intro`, values)}</p>
        {SECTIONS[doc].map((section) => {
          const key = `${doc}.sections.${section}` as SectionKey;
          return (
            <section key={key} className="mt-8">
              <h2 className="text-lg font-semibold">{t(`${key}.title`)}</h2>
              {t(`${key}.body`, values)
                .split("\n\n")
                .map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mt-2 text-pretty text-muted-foreground"
                  >
                    {paragraph}
                  </p>
                ))}
            </section>
          );
        })}
      </main>
      <footer className="border-t">
        <LegalLinks className="mx-auto max-w-3xl justify-end px-4 py-6 sm:px-6" />
      </footer>
    </div>
  );
}

export async function LegalLinks({ className = "" }: { className?: string }) {
  const t = await getTranslations("legal.links");
  return (
    <nav className={`flex gap-4 text-sm text-muted-foreground ${className}`}>
      <Link href="/privacy" className="hover:text-foreground">
        {t("privacy")}
      </Link>
      <Link href="/terms" className="hover:text-foreground">
        {t("terms")}
      </Link>
    </nav>
  );
}
