"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  AccountRef,
  type AccountRefData,
} from "@/components/accounts/account-ref";
import {
  TimeChart,
  type ChartMarker,
  type ChartSeries,
} from "@/components/charts/time-chart";
import { ExpandableChartCard } from "@/components/charts/expandable-chart-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

type Point = { time: string; value: number };

type NetWorthData = {
  netWorth: Point[];
  accounts: { accountId: string; account: AccountRefData; points: Point[] }[];
  markers: { time: string; cents: number; label: string }[];
};

export function NetWorthCard({ className, ...data }: NetWorthData & { className?: string }) {
  const t = useTranslations("dashboard.netWorth");
  // Shared so the full view opens in the same mode as the card.
  const [split, setSplit] = useState(false);
  return (
    <ExpandableChartCard className={className} title={t("title")} description={t("description")}>
      {(expanded) => <NetWorthChart {...data} split={split} onSplitChange={setSplit} expanded={expanded} />}
    </ExpandableChartCard>
  );
}

export function CashFlowCard({
  className,
  months,
  granularity = "month",
}: {
  className?: string;
  months: CashFlowMonth[];
  granularity?: "month" | "week";
}) {
  const t = useTranslations("dashboard.cashFlow");
  return (
    <ExpandableChartCard
      className={className}
      title={granularity === "week" ? t("titleWeekly") : t("title")}
      description={t.rich("description", {
        income: (c) => <span className="text-emerald-600">{c}</span>,
        spending: (c) => <span className="text-red-500">{c}</span>,
      })}
    >
      {(expanded) => (expanded ? <div className="min-h-0 flex-1"><CashFlowChart months={months} monthly={granularity === "month"} height="100%" /></div> : <CashFlowChart months={months} monthly={granularity === "month"} />)}
    </ExpandableChartCard>
  );
}

function NetWorthChart({
  netWorth,
  accounts,
  markers,
  split,
  onSplitChange: setSplit,
  expanded,
}: NetWorthData & { split: boolean; onSplitChange: (split: boolean) => void; expanded: boolean }) {
  const t = useTranslations("dashboard.netWorth");
  const series = useMemo<ChartSeries[]>(
    () =>
      split
        ? accounts.map((a, i) => ({
            kind: "line",
            data: a.points,
            color: PALETTE[i % PALETTE.length]!,
            title: a.account.ibanLast4
              ? `${a.account.name} *${a.account.ibanLast4}`
              : a.account.name,
          }))
        : [{ kind: "area", data: netWorth, color: "#059669" }],
    [split, accounts, netWorth],
  );
  const chartMarkers = useMemo<ChartMarker[] | undefined>(
    () =>
      split
        ? undefined
        : markers
            .filter((m) => netWorth.some((p) => p.time === m.time))
            .map((m) => ({
              time: m.time,
              text: formatMoney(-Math.round(m.cents / 100) * 100),
              color: "#dc2626",
              position: "aboveBar",
              shape: "arrowDown",
            })),
    [split, markers, netWorth],
  );
  return (
    <div className={cn("space-y-2", expanded && "flex min-h-0 flex-1 flex-col")}>
      <div className="flex justify-end gap-1">
        <Button
          size="sm"
          variant={split ? "ghost" : "secondary"}
          onClick={() => setSplit(false)}
        >
          {t("total")}
        </Button>
        <Button
          size="sm"
          variant={split ? "secondary" : "ghost"}
          onClick={() => setSplit(true)}
        >
          {t("byAccount")}
        </Button>
      </div>
      {expanded ? (
        <div className="min-h-0 flex-1">
          <TimeChart series={series} markers={chartMarkers} height="100%" />
        </div>
      ) : (
        <TimeChart series={series} markers={chartMarkers} height={300} />
      )}
      {split && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {accounts.map((a, i) => (
            <span
              key={a.accountId}
              className="flex min-w-0 items-center gap-1.5"
            >
              <span
                className="h-0.5 w-3 shrink-0"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              <AccountRef account={a.account} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const PALETTE = [
  "#6366f1",
  "#f97316",
  "#0ea5e9",
  "#22c55e",
  "#ec4899",
  "#eab308",
  "#14b8a6",
  "#8b5cf6",
];

type CashFlowMonth = { time: string; income: number; expenses: number; net: number };

function CashFlowChart({ months, monthly, height = 300 }: { months: CashFlowMonth[]; monthly: boolean; height?: number | string }) {
  const netColor = useTheme().resolvedTheme === "dark" ? "#f4f4f5" : "#18181b";
  const series = useMemo<ChartSeries[]>(
    () => [
      {
        kind: "histogram",
        data: months.map((m) => ({ time: m.time, value: m.income })),
        color: "#10b981",
      },
      {
        kind: "histogram",
        data: months.map((m) => ({ time: m.time, value: -m.expenses })),
        color: "#f87171",
      },
      {
        kind: "line",
        data: months.map((m) => ({ time: m.time, value: m.net })),
        color: netColor,
        lineWidth: 2,
      },
    ],
    [months, netColor],
  );
  return <TimeChart series={series} height={height} monthly={monthly} />;
}
