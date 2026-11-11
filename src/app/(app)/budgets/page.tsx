import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getBudgetMonth } from "@/lib/budgets";
import { formatMonth } from "@/lib/labels";
import { requireContext } from "@/lib/server/auth";
import { isMonthParam, monthBounds, shiftMonth } from "@/lib/statement-months";
import { BudgetsView } from "@/components/budgets/budgets-view";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("budgets");
  return { title: t("title") };
}

/** Today in the app's time zone (see i18n/request), as `yyyy-MM-dd`. */
const todayInMadrid = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const today = todayInMadrid();
  const currentMonth = today.slice(0, 7);
  const month = isMonthParam(params.month) ? params.month : currentMonth;
  const { db, user, household } = await requireContext();
  const [locale, t] = await Promise.all([getLocale(), getTranslations("budgets")]);
  const data = await getBudgetMonth(db, household.id, user.id, month, today, locale);
  const monthLabel = formatMonth(month, "long", locale);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")}>
        <MonthNav month={month} currentMonth={currentMonth} label={monthLabel} />
      </PageHeader>
      {!data.hasTransactions && month <= currentMonth && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            {t("noData", { month: monthLabel })}{" "}
            <Link href="/import" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              {t("importLink")}
            </Link>
          </span>
        </p>
      )}
      <BudgetsView
        key={month}
        data={{
          month,
          monthLabel,
          range: monthBounds(month),
          pace: data.pace,
          past: month < currentMonth,
          averageMonths: data.averageMonths,
          income: data.income,
          categories: data.categories,
          uncategorized: data.uncategorized,
          otherSpending: data.otherSpending,
        }}
      />
    </>
  );
}

async function MonthNav({ month, currentMonth, label }: { month: string; currentMonth: string; label: string }) {
  const t = await getTranslations("budgets.month");
  return (
    <nav aria-label={t("label")} className="flex items-center gap-2">
      <div className="flex items-center rounded-lg border bg-background">
        <Button asChild variant="ghost" size="icon" className="size-9 rounded-r-none">
          <Link href={`?month=${shiftMonth(month, -1)}`} aria-label={t("previous")} scroll={false}>
            <ChevronLeft />
          </Link>
        </Button>
        <span className="min-w-36 px-2 whitespace-nowrap text-center text-sm font-medium first-letter:uppercase" aria-live="polite">
          {label}
        </span>
        <Button asChild variant="ghost" size="icon" className="size-9 rounded-l-none">
          <Link href={`?month=${shiftMonth(month, 1)}`} aria-label={t("next")} scroll={false}>
            <ChevronRight />
          </Link>
        </Button>
      </div>
      {month !== currentMonth && (
        <Button asChild variant="outline" size="sm" className="h-9">
          <Link href="/budgets" scroll={false}>
            {t("current")}
          </Link>
        </Button>
      )}
    </nav>
  );
}
