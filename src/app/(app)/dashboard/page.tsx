import type { Metadata } from "next";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getMembers } from "@/lib/households";
import { formatDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { getDashboard, parsePeriod, parseScope, parseView } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { amountsHidden } from "@/lib/server/privacy";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CategoryBreakdown } from "./category-breakdown";
import { CategoryColumnsCard } from "./category-columns";
import { CashFlowCard, NetWorthCard } from "./charts";
import { DashboardFilters } from "./filters";
import { changeTrend, Delta, KpiCard, trend } from "./kpi-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ scope?: string; period?: string; view?: string }> }) {
  const params = await searchParams;
  const scope = parseScope(params.scope);
  const period = parsePeriod(params.period);
  const view = parseView(params.view);
  const { db, user, household } = await requireContext();
  const [locale, hidden] = await Promise.all([getLocale(), amountsHidden()]);
  const [t, tc] = await Promise.all([getTranslations("dashboard"), getTranslations("common")]);
  const [data, members] = await Promise.all([getDashboard(db, household.id, user.id, scope, period, locale, view), getMembers(db, household.id)]);
  const { kpis, previous, average } = data;
  const avg = average.active;
  const scopes = [
    { value: "household", label: tc("household") },
    ...(members.length > 1 ? [{ value: "shared", label: tc("shared") }] : []),
    ...members.map((m) => ({ value: `member:${m.id}`, label: m.id === user.id ? tc("you", { name: m.displayName }) : m.displayName })),
  ];
  const deltaLabel = (pct: string) => t("kpis.delta", { pct });

  if (!data.range.hasData) {
    return (
      <>
        <DashboardFilters scopes={scopes} months={data.availableMonths} range={data.range} average={average} />
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <FileUp className="size-12 text-emerald-600" />
            <div>
              <p className="text-lg font-medium">{t("empty.title")}</p>
              <p className="text-sm text-muted-foreground">{t("empty.description")}</p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/accounts">{t("empty.addAccounts")}</Link>
              </Button>
              <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                <Link href="/import">{t("empty.upload")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const kpiCards = [
    {
      label: t("kpis.netWorth"),
      value: kpis.netWorth === null ? "—" : formatMoney(kpis.netWorth, "EUR", { hidden }),
      sub:
        kpis.netWorthChange === null ? null : (
          <span className={cn("text-xs font-medium", kpis.netWorthChange >= 0 ? "text-emerald-600" : "text-red-600")}>
            {t(avg ? "kpis.netWorthChangeAvg" : "kpis.netWorthChange", { amount: formatMoney(kpis.netWorthChange, "EUR", { signed: true, hidden }) })}
          </span>
        ),
      trend: changeTrend(kpis.netWorthChange),
    },
    {
      label: t(avg ? "kpis.incomeAvg" : "kpis.income"),
      value: formatMoney(kpis.income, "EUR", { hidden }),
      sub: <Delta current={kpis.income} previous={previous?.income} label={deltaLabel} />,
      trend: trend(kpis.income, previous?.income)?.trend,
    },
    {
      label: t(avg ? "kpis.spendingAvg" : "kpis.spending"),
      value: formatMoney(kpis.expenses, "EUR", { hidden }),
      sub: <Delta current={kpis.expenses} previous={previous?.expenses} invert label={deltaLabel} />,
      trend: trend(kpis.expenses, previous?.expenses, true)?.trend,
    },
    {
      label: t(avg ? "kpis.savedAvg" : "kpis.saved"),
      value: formatMoney(kpis.net, "EUR", { hidden }),
      sub: (
        <span className="text-xs text-muted-foreground">
          {kpis.savingsRate === null ? "—" : t("kpis.savingsRate", { pct: Math.round(kpis.savingsRate * 100) })}
        </span>
      ),
      trend: trend(kpis.net, previous?.net)?.trend,
    },
  ];

  const txHref = (extra: Record<string, string>) => `/transactions?${new URLSearchParams({ from: data.range.start, to: data.range.end, ...extra })}`;
  const categoryItems = data.categoryRanking.map((c) => ({
    key: c.categoryId ?? "none",
    name: c.name ?? tc("uncategorized"),
    icon: c.icon,
    color: c.color,
    cents: c.cents,
    spent: c.spent,
    reimbursed: c.reimbursed,
    count: c.count,
    pct: c.pct,
    href: txHref({ category: c.categoryId ?? "none" }),
  }));

  return (
    <>
      <DashboardFilters scopes={scopes} months={data.availableMonths} range={data.range} average={average} />
      <p className="mb-4 text-xs text-muted-foreground">
        {t("range.period", { start: formatDate(data.range.start, locale), end: formatDate(data.range.end, locale) })} ·{" "}
        {avg && <span className="font-medium text-emerald-700 dark:text-emerald-400">{t("range.average", { count: average.months })} · </span>}
        {tc("accountsCount", { count: data.accounts.length })}
        {scope.startsWith("member:") && ` · ${t("range.memberShare")}`}
        {/* A standing footnote, so phones skip it to keep the caption short. */}
        <span className="hidden md:inline"> · {t("range.transfersExcluded")}</span>
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <NetWorthCard className="lg:col-span-3" netWorth={data.netWorth} accounts={data.accountSeries} />
        <CashFlowCard className="lg:col-span-2" months={data.months} granularity={data.cashFlowGranularity} average={data.cashFlowAverage} />
      </div>

      <CategoryColumnsCard className="mt-6" items={categoryItems} average={avg} />

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <CategoryBreakdown className="lg:col-span-3" items={categoryItems} average={avg} />
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("topMerchants.title")}</CardTitle>
            <CardDescription>{t(avg ? "topMerchants.descriptionAvg" : "topMerchants.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.topMerchants.map((m, i) => (
                <li key={m.name}>
                  <Link href={txHref({ q: m.name })} className="flex items-center gap-3 py-2 text-sm hover:text-emerald-700 dark:hover:text-emerald-400">
                    <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{t(avg ? "topMerchants.countAvg" : "topMerchants.count", { count: m.count })}</span>
                    <Money cents={m.cents} className="font-medium" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
