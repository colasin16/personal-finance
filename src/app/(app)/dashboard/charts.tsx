"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { TimeChart, type ChartMarker, type ChartSeries } from "@/components/charts/time-chart";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";

type Point = { time: string; value: number };

export function NetWorthChart({
  netWorth,
  accounts,
  markers,
}: {
  netWorth: Point[];
  accounts: { accountId: string; name: string; color: string; points: Point[] }[];
  markers: { time: string; cents: number; label: string }[];
}) {
  const [split, setSplit] = useState(false);
  const series = useMemo<ChartSeries[]>(
    () =>
      split
        ? accounts.map((a, i) => ({ kind: "line", data: a.points, color: PALETTE[i % PALETTE.length]!, title: a.name }))
        : [{ kind: "area", data: netWorth, color: "#059669" }],
    [split, accounts, netWorth],
  );
  const chartMarkers = useMemo<ChartMarker[] | undefined>(
    () =>
      split
        ? undefined
        : markers
            .filter((m) => netWorth.some((p) => p.time === m.time))
            .map((m) => ({ time: m.time, text: formatMoney(-Math.round(m.cents / 100) * 100), color: "#dc2626", position: "aboveBar", shape: "arrowDown" })),
    [split, markers, netWorth],
  );
  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-1">
        <Button size="sm" variant={split ? "ghost" : "secondary"} onClick={() => setSplit(false)}>
          Total
        </Button>
        <Button size="sm" variant={split ? "secondary" : "ghost"} onClick={() => setSplit(true)}>
          By account
        </Button>
      </div>
      <TimeChart series={series} markers={chartMarkers} height={300} />
      {split && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {accounts.map((a, i) => (
            <span key={a.accountId} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3" style={{ background: PALETTE[i % PALETTE.length] }} /> {a.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const PALETTE = ["#6366f1", "#f97316", "#0ea5e9", "#22c55e", "#ec4899", "#eab308", "#14b8a6", "#8b5cf6"];

export function CashFlowChart({ months }: { months: { time: string; income: number; expenses: number; net: number }[] }) {
  const netColor = useTheme().resolvedTheme === "dark" ? "#f4f4f5" : "#18181b";
  const series = useMemo<ChartSeries[]>(
    () => [
      { kind: "histogram", data: months.map((m) => ({ time: m.time, value: m.income })), color: "#10b981" },
      { kind: "histogram", data: months.map((m) => ({ time: m.time, value: -m.expenses })), color: "#f87171" },
      { kind: "line", data: months.map((m) => ({ time: m.time, value: m.net })), color: netColor, lineWidth: 2 },
    ],
    [months, netColor],
  );
  return <TimeChart series={series} height={300} monthly />;
}
