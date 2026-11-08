import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Trend = "good" | "bad" | "flat";

/** Whether `current` improved on `previous` (lower is better when `invert`); null when there's nothing to compare. */
export function trend(current: number, previous: number | undefined | null, invert = false): { change: number; trend: Trend } | null {
  if (previous === undefined || previous === null || previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  if (Math.abs(change) < 0.005) return { change, trend: "flat" };
  return { change, trend: (invert ? change < 0 : change > 0) ? "good" : "bad" };
}

/** Trend of a signed change (e.g. net worth over the period): growing is good, shrinking bad; null when unknown or zero. */
export function changeTrend(change: number | null | undefined): Trend | null {
  if (!change) return null;
  return change > 0 ? "good" : "bad";
}

/** Faint wash from the top-right corner, matching the delta's colour; works over the card colour in light and dark mode. */
const TREND_TINT: Record<Trend, string | undefined> = {
  good: "bg-linear-to-bl from-emerald-500/10 via-transparent via-60% to-transparent",
  bad: "bg-linear-to-bl from-red-500/10 via-transparent via-60% to-transparent",
  flat: undefined,
};

/** "↗ 12% vs previous period", coloured by whether the change is an improvement. */
export function Delta({
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
  const result = trend(current, previous, invert);
  if (!result) return null;
  const { change } = result;
  const Icon = result.trend === "flat" ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center text-xs font-medium", { flat: "text-muted-foreground", good: "text-emerald-600", bad: "text-red-600" }[result.trend])}>
      <Icon className="size-3.5" />
      {label(Math.abs(change * 100).toFixed(0))}
    </span>
  );
}

/** One headline figure. Pass `trend` (from the same comparison as the Delta in `sub`) to tint the card green or red. */
export function KpiCard({ label, value, sub, trend: cardTrend }: { label: string; value: string; sub?: ReactNode; trend?: Trend | null }) {
  return (
    <Card className={cn("gap-1 py-4", cardTrend && TREND_TINT[cardTrend])}>
      <CardContent className="space-y-1 px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <div className="h-4">{sub}</div>
      </CardContent>
    </Card>
  );
}
