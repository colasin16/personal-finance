import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, FileUp, Minus } from "lucide-react";
import { getMembers } from "@/lib/households";
import { formatDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { getDashboard, parsePeriod, parseScope, PERIODS } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CashFlowChart, NetWorthChart } from "./charts";
import { DashboardFilters } from "./filters";

export const metadata: Metadata = { title: "Dashboard" };

function Delta({ current, previous, invert = false }: { current: number; previous: number | undefined | null; invert?: boolean }) {
  if (previous === undefined || previous === null || previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  const good = invert ? change < 0 : change > 0;
  const Icon = Math.abs(change) < 0.005 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center text-xs font-medium", Math.abs(change) < 0.005 ? "text-muted-foreground" : good ? "text-emerald-600" : "text-red-600")}>
      <Icon className="size-3.5" />
      {Math.abs(change * 100).toFixed(0)}% vs previous period
    </span>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ scope?: string; period?: string }> }) {
  const params = await searchParams;
  const scope = parseScope(params.scope);
  const period = parsePeriod(params.period);
  const { db, user, household } = await requireContext();
  const [data, members] = await Promise.all([getDashboard(db, household.id, user.id, scope, period), getMembers(db, household.id)]);
  const { kpis, previous } = data;
  const scopes = [
    { value: "household", label: "Household" },
    ...(members.length > 1 ? [{ value: "shared", label: "Shared" }] : []),
    ...members.map((m) => ({ value: `member:${m.id}`, label: m.id === user.id ? `${m.displayName} (you)` : m.displayName })),
  ];

  if (!data.range.hasData) {
    return (
      <>
        <DashboardFilters scopes={scopes} periods={PERIODS} />
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <FileUp className="size-12 text-emerald-600" />
            <div>
              <p className="text-lg font-medium">Your dashboard fills up as you import statements</p>
              <p className="text-sm text-muted-foreground">Add your accounts, then drop last month&apos;s PDFs from each bank.</p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/accounts">Add accounts</Link>
              </Button>
              <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                <Link href="/import">Upload statements</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const kpiCards = [
    {
      label: "Net worth",
      value: kpis.netWorth === null ? "—" : formatMoney(kpis.netWorth),
      sub:
        kpis.netWorthChange === null ? null : (
          <span className={cn("text-xs font-medium", kpis.netWorthChange >= 0 ? "text-emerald-600" : "text-red-600")}>
            {formatMoney(kpis.netWorthChange, "EUR", { signed: true })} this period
          </span>
        ),
    },
    { label: "Income", value: formatMoney(kpis.income), sub: <Delta current={kpis.income} previous={previous?.income} /> },
    { label: "Spending", value: formatMoney(kpis.expenses), sub: <Delta current={kpis.expenses} previous={previous?.expenses} invert /> },
    {
      label: "Saved",
      value: formatMoney(kpis.net),
      sub: (
        <span className="text-xs text-muted-foreground">
          {kpis.savingsRate === null ? "—" : `${Math.round(kpis.savingsRate * 100)}% of income`}
        </span>
      ),
    },
  ];

  const txHref = (extra: Record<string, string>) => `/transactions?${new URLSearchParams({ from: data.range.start, to: data.range.end, ...extra })}`;

  return (
    <>
      <DashboardFilters scopes={scopes} periods={PERIODS} />
      <p className="mb-4 text-xs text-muted-foreground">
        {formatDate(data.range.start)} – {formatDate(data.range.end)} · {data.accounts.length} account{data.accounts.length === 1 ? "" : "s"}
        {scope.startsWith("member:") && " · shared accounts counted at this person's share"} · transfers between your accounts are excluded
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
            <CardTitle>Net worth</CardTitle>
            <CardDescription>Sum of account balances. Arrows mark your biggest expenses.</CardDescription>
          </CardHeader>
          <CardContent>
            <NetWorthChart netWorth={data.netWorth} accounts={data.accountSeries} markers={data.markers} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly cash flow</CardTitle>
            <CardDescription>
              <span className="text-emerald-600">Income</span> vs <span className="text-red-500">spending</span>, line = saved
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CashFlowChart months={data.months} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Where the money goes</CardTitle>
            <CardDescription>Spending by category · click to see the transactions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.categoryRanking.length === 0 && <p className="text-sm text-muted-foreground">No spending in this period.</p>}
            {data.categoryRanking.map((c) => (
              <Link
                key={c.categoryId ?? "none"}
                href={txHref({ category: c.categoryId ?? "none" })}
                className="group block space-y-1 rounded-md p-1 -m-1 hover:bg-muted/60"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                    {c.name}
                    <span className="text-xs text-muted-foreground">{c.count} tx</span>
                  </span>
                  <span className="tabular-nums">
                    <Money cents={c.cents} className="font-medium" /> <span className="text-xs text-muted-foreground">{Math.round(c.pct * 100)}%</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(1, c.pct * 100)}%`, background: c.color }} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top merchants</CardTitle>
            <CardDescription>Where you spent the most</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.topMerchants.map((m, i) => (
                <li key={m.name}>
                  <Link href={txHref({ q: m.name })} className="flex items-center gap-3 py-2 text-sm hover:text-emerald-700">
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
