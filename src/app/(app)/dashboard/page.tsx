import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, FileUp, Minus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getMembers } from "@/lib/households";
import { formatDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { getDashboard, parsePeriod, parseScope, PERIODS } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CategoryBreakdown } from "./category-breakdown";
import { CashFlowChart, NetWorthChart } from "./charts";
import { DashboardFilters } from "./filters";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

function Delta({
  current,
  previous,
  invert = false,
  label,
}: {
  current: number;
  previous: number | undefined | null;
  invert?: boolean;
  label: (pct: string) => string;
}) {
  if (previous === undefined || previous === null || previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  const good = invert ? change < 0 : change > 0;
  const Icon = Math.abs(change) < 0.005 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center text-xs font-medium", Math.abs(change) < 0.005 ? "text-muted-foreground" : good ? "text-emerald-600" : "text-red-600")}>
      <Icon className="size-3.5" />
      {label(Math.abs(change * 100).toFixed(0))}
    </span>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ scope?: string; period?: string }> }) {
  const params = await searchParams;
  const scope = parseScope(params.scope);
  const period = parsePeriod(params.period);
  const { db, user, household } = await requireContext();
  const locale = await getLocale();
  const [t, tc] = await Promise.all([getTranslations("dashboard"), getTranslations("common")]);
  const [data, members] = await Promise.all([getDashboard(db, household.id, user.id, scope, period, locale), getMembers(db, household.id)]);
  const { kpis, previous } = data;
  const scopes = [
    { value: "household", label: tc("household") },
    ...(members.length > 1 ? [{ value: "shared", label: tc("shared") }] : []),
    ...members.map((m) => ({ value: `member:${m.id}`, label: m.id === user.id ? tc("you", { name: m.displayName }) : m.displayName })),
  ];
  const deltaLabel = (pct: string) => t("kpis.delta", { pct });

  if (!data.range.hasData) {
    return (
      <>
        <DashboardFilters scopes={scopes} periods={PERIODS} />
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
      value: kpis.netWorth === null ? "—" : formatMoney(kpis.netWorth),
      sub:
        kpis.netWorthChange === null ? null : (
          <span className={cn("text-xs font-medium", kpis.netWorthChange >= 0 ? "text-emerald-600" : "text-red-600")}>
            {t("kpis.netWorthChange", { amount: formatMoney(kpis.netWorthChange, "EUR", { signed: true }) })}
          </span>
        ),
    },
    { label: t("kpis.income"), value: formatMoney(kpis.income), sub: <Delta current={kpis.income} previous={previous?.income} label={deltaLabel} /> },
    {
      label: t("kpis.spending"),
      value: formatMoney(kpis.expenses),
      sub: <Delta current={kpis.expenses} previous={previous?.expenses} invert label={deltaLabel} />,
    },
    {
      label: t("kpis.saved"),
      value: formatMoney(kpis.net),
      sub: (
        <span className="text-xs text-muted-foreground">
          {kpis.savingsRate === null ? "—" : t("kpis.savingsRate", { pct: Math.round(kpis.savingsRate * 100) })}
        </span>
      ),
    },
  ];

  const txHref = (extra: Record<string, string>) => `/transactions?${new URLSearchParams({ from: data.range.start, to: data.range.end, ...extra })}`;

  return (
    <>
      <DashboardFilters scopes={scopes} periods={PERIODS} />
      <p className="mb-4 text-xs text-muted-foreground">
        {t("range.period", { start: formatDate(data.range.start, locale), end: formatDate(data.range.end, locale) })} ·{" "}
        {tc("accountsCount", { count: data.accounts.length })}
        {scope.startsWith("member:") && ` · ${t("range.memberShare")}`} · {t("range.transfersExcluded")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <Card key={k.label} className="gap-1 py-4">
            <CardContent className="space-y-1 px-4">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{k.value}</p>
              <div className="h-4">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("netWorth.title")}</CardTitle>
            <CardDescription>{t("netWorth.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <NetWorthChart netWorth={data.netWorth} accounts={data.accountSeries} markers={data.markers} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("cashFlow.title")}</CardTitle>
            <CardDescription>
              {t.rich("cashFlow.description", {
                income: (c) => <span className="text-emerald-600">{c}</span>,
                spending: (c) => <span className="text-red-500">{c}</span>,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CashFlowChart months={data.months} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <CategoryBreakdown
          className="lg:col-span-3"
          items={data.categoryRanking.map((c) => ({
            key: c.categoryId ?? "none",
            name: c.name ?? tc("uncategorized"),
            color: c.color,
            cents: c.cents,
            count: c.count,
            pct: c.pct,
            href: txHref({ category: c.categoryId ?? "none" }),
          }))}
        />
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("topMerchants.title")}</CardTitle>
            <CardDescription>{t("topMerchants.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.topMerchants.map((m, i) => (
                <li key={m.name}>
                  <Link href={txHref({ q: m.name })} className="flex items-center gap-3 py-2 text-sm hover:text-emerald-700 dark:hover:text-emerald-400">
                    <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.count}×</span>
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
