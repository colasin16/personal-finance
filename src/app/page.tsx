import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChartColumn, Cpu, FileUp, KeyRound, Layers, Lock, Tags, Users, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { BankLogo } from "@/components/brand/bank-logo";
import { Logo } from "@/components/brand/logo";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { LanguageSwitch } from "@/components/theme/language-switch";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { BANKS } from "@/lib/db/seed";
import { getCurrentUser } from "@/lib/server/auth";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("landing"))("metaTitle") };
}

const STEPS = [
  { key: "upload", icon: FileUp },
  { key: "sort", icon: Tags },
  { key: "understand", icon: ChartColumn },
] as const satisfies { key: string; icon: LucideIcon }[];

const FEATURES = [
  { key: "oneView", icon: Layers },
  { key: "habits", icon: ChartColumn },
  { key: "together", icon: Users },
] as const satisfies { key: string; icon: LucideIcon }[];

const SECURITY = [
  { key: "noLogin", icon: KeyRound },
  { key: "encrypted", icon: Lock },
  { key: "private", icon: Cpu },
] as const satisfies { key: string; icon: LucideIcon }[];

/** Public landing page; signed-in users go straight to their dashboard. */
export default async function Home() {
  if (await getCurrentUser()) redirect("/dashboard");
  const t = await getTranslations("landing");
  const appName = (await getTranslations("common"))("appName");
  const banks = BANKS.filter((b) => b.id !== "other");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Logo className="mr-auto" textClassName="hidden sm:inline" />
          <LanguageSwitch />
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">{t("nav.signIn")}</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/login">{t("nav.getStarted")}</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="space-y-6">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t("hero.eyebrow")}</p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">{t("hero.title")}</h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">{t("hero.description")}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/login">
                  {t("hero.cta")}
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how-it-works">{t("hero.secondary")}</a>
              </Button>
            </div>
          </div>
          <DashboardPreview />
        </section>

        <section className="border-y bg-muted/40">
          <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
            <h2 className="text-center text-sm font-medium text-muted-foreground">{t("banks.title")}</h2>
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
              {banks.map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-sm font-medium">
                  <BankLogo bankId={b.id} name={b.name} color={b.color} size={24} />
                  {b.name}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("how.title")}</h2>
            <p className="mt-3 text-muted-foreground">{t("how.description")}</p>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ key, icon: Icon }, i) => (
              <li key={key} className="rounded-2xl border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{t(`how.steps.${key}.title`)}</h3>
                <p className="mt-2 text-muted-foreground">{t(`how.steps.${key}.description`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid gap-10 md:grid-cols-3">
            {FEATURES.map(({ key, icon: Icon }) => (
              <div key={key}>
                <Icon className="size-6 text-emerald-600" />
                <h3 className="mt-4 text-xl font-semibold">{t(`features.${key}.title`)}</h3>
                <p className="mt-2 text-muted-foreground">{t(`features.${key}.description`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-zinc-800 bg-zinc-950 text-zinc-50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("security.title")}</h2>
              <p className="mt-3 text-zinc-400">{t("security.description")}</p>
            </div>
            <ul className="mt-12 grid gap-8 md:grid-cols-3">
              {SECURITY.map(({ key, icon: Icon }) => (
                <li key={key}>
                  <Icon className="size-6 text-emerald-400" />
                  <h3 className="mt-4 text-lg font-semibold">{t(`security.items.${key}.title`)}</h3>
                  <p className="mt-2 text-zinc-400">{t(`security.items.${key}.description`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("finalCta.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("finalCta.description")}</p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/login">
              {t("finalCta.cta")}
              <ArrowRight />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <Logo className="text-foreground" />
          <span>{t("footer.rights", { year: new Date().getFullYear(), appName })}</span>
        </div>
      </footer>
    </div>
  );
}
