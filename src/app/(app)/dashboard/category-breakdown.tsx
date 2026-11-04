"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChartPie, List, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { CATEGORY_TEXT, CategoryIcon, categoryTint } from "@/components/transactions/category-label";
import { Money } from "@/components/money";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { ExpandableChartCard } from "@/components/charts/expandable-chart-card";
import { cn } from "@/lib/utils";

export type CategorySlice = {
  key: string;
  name: string;
  icon?: string | null;
  color: string;
  /** Net spending: `spent` minus `reimbursed`. */
  cents: number;
  spent: number;
  reimbursed: number;
  count: number;
  pct: number;
  href: string;
};

const STROKE = 36;
const HOVER_GROW = 8;
// Room around the ring so a hovered (thicker) slice is never clipped.
const PAD = 12;
const SIZE = 220 + PAD * 2;
const R = (SIZE - STROKE) / 2 - PAD;
const CIRCUMFERENCE = 2 * Math.PI * R;
// Small visual gap between slices, skipped when there is only one slice.
const GAP = 2;

function Pie({
  items,
  active,
  onActive,
  average,
  className,
}: {
  items: CategorySlice[];
  active: number | null;
  onActive: (i: number | null) => void;
  average: boolean;
  className?: string;
}) {
  const t = useTranslations("dashboard.ranking");
  const router = useRouter();
  const total = items.reduce((sum, c) => sum + c.cents, 0);
  const focus = active === null ? null : items[active];
  const gap = items.length > 1 ? GAP : 0;
  const starts = items.map((_, i) => items.slice(0, i).reduce((sum, c) => sum + c.pct * CIRCUMFERENCE, 0));

  return (
    <div className={cn("relative mx-auto size-[244px] shrink-0", className)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90" role="img" aria-label={t("pieLabel")}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
        {items.map((c, i) => {
          const len = c.pct * CIRCUMFERENCE;
          const dash = Math.max(0.5, len - gap);
          return (
            <circle
              key={c.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={c.color}
              strokeWidth={active === i ? STROKE + HOVER_GROW : STROKE}
              strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
              strokeDashoffset={-starts[i]}
              className={cn("cursor-pointer transition-all", active !== null && active !== i && "opacity-40")}
              onMouseEnter={() => onActive(i)}
              onMouseLeave={() => onActive(null)}
              onClick={() => router.push(c.href)}
            >
              <title>{`${c.name} · ${Math.round(c.pct * 100)}%`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-14 text-center">
        <span className="line-clamp-2 text-xs text-muted-foreground">{focus ? focus.name : t(average ? "totalAvg" : "total")}</span>
        <Money cents={focus ? focus.cents : total} className="text-lg font-semibold" />
        {focus && <span className="text-xs text-muted-foreground">{Math.round(focus.pct * 100)}%</span>}
      </div>
    </div>
  );
}

export const REIMBURSED_TEXT = "text-emerald-700 dark:text-emerald-400";
/** Diagonal stripes in the reimbursement green (via currentColor): the reimbursed part of a category's spending. */
export const HATCH = { backgroundImage: "repeating-linear-gradient(-45deg, currentColor 0 2px, transparent 2px 5px)" };

function Reimbursed({ c, className }: { c: CategorySlice; className?: string }) {
  const t = useTranslations("dashboard.ranking");
  return (
    <span
      className={cn("inline-flex items-center gap-1 tabular-nums", REIMBURSED_TEXT, className)}
      title={t("netOf", { spent: formatMoney(c.spent), reimbursed: formatMoney(c.reimbursed) })}
    >
      <Undo2 className="size-3 shrink-0" aria-hidden />
      {formatMoney(-c.reimbursed, "EUR", { signed: true })}
      <span className="sr-only sm:not-sr-only">{t("reimbursedLabel")}</span>
    </span>
  );
}

function CategoryBars({ items, average }: { items: CategorySlice[]; average: boolean }) {
  const t = useTranslations("dashboard.ranking");
  // Bars show the share of total net spending; the reimbursed segment uses the same scale.
  const total = items.reduce((sum, c) => sum + c.cents, 0) || 1;
  const anyReimbursed = items.some((c) => c.reimbursed > 0);
  return (
    <div className="space-y-2">
      {items.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          className="group block space-y-2 rounded-lg border px-3 py-2.5 transition-[filter] hover:brightness-95 dark:hover:brightness-125"
          style={categoryTint(c.color)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={cn("flex items-center gap-2 text-sm font-medium", CATEGORY_TEXT)}>
                <CategoryIcon icon={c.icon} className="size-4 shrink-0" />
                <span className="truncate">{c.name}</span>
              </p>
              <p className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                {t(average ? "countAvg" : "count", { count: c.count })} · {t("share", { pct: Math.round(c.pct * 100) })}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Money cents={c.cents} className="block text-sm font-semibold" />
              {c.reimbursed > 0 && <Reimbursed c={c} className="mt-0.5 text-xs" />}
            </div>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-background/50">
            <div
              className={cn("h-full transition-all", c.reimbursed > 0 ? "rounded-l-full" : "rounded-full")}
              style={{ width: `${Math.max(1, c.pct * 100)}%`, background: c.color }}
            />
            {c.reimbursed > 0 && (
              <div className={cn("h-full rounded-r-full transition-all", REIMBURSED_TEXT)} style={{ width: `${(c.reimbursed / total) * 100}%`, ...HATCH }} />
            )}
          </div>
        </Link>
      ))}
      {anyReimbursed && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-muted-foreground" aria-hidden />
            {t("legendNet")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-1.5 w-4 rounded-full", REIMBURSED_TEXT)} style={HATCH} aria-hidden />
            {t("legendReimbursed")}
          </span>
        </p>
      )}
    </div>
  );
}

function PieLegend({ items, active, onActive, className }: { items: CategorySlice[]; active: number | null; onActive: (i: number | null) => void; className?: string }) {
  const t = useTranslations("dashboard.ranking");
  return (
    <ul className={cn("w-full space-y-1 overflow-y-auto pr-1", className)}>
      {items.map((c, i) => (
        <li key={c.key}>
          <Link
            href={c.href}
            onMouseEnter={() => onActive(i)}
            onMouseLeave={() => onActive(null)}
            onFocus={() => onActive(i)}
            onBlur={() => onActive(null)}
            style={categoryTint(c.color)}
            className={cn("flex items-center gap-2 rounded-md border px-2 py-1 text-sm transition-[filter] hover:brightness-95 dark:hover:brightness-125", active === i && "brightness-95 dark:brightness-125")}
          >
            <CategoryIcon icon={c.icon} className={CATEGORY_TEXT} />
            <span className={cn("min-w-0 flex-1 truncate font-medium", CATEGORY_TEXT)}>{c.name}</span>
            {c.reimbursed > 0 && (
              <span title={t("netOf", { spent: formatMoney(c.spent), reimbursed: formatMoney(c.reimbursed) })}>
                <Undo2 className={cn("size-3.5", REIMBURSED_TEXT)} aria-label={t("legendReimbursed")} />
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">{Math.round(c.pct * 100)}%</span>
            <Money cents={c.cents} className="w-24 text-right font-medium" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** `average`: amounts and counts are per-month averages (dashboard `view=avg`). */
export function CategoryBreakdown({ items, average = false, className }: { items: CategorySlice[]; average?: boolean; className?: string }) {
  const t = useTranslations("dashboard.ranking");
  const [view, setView] = useState<"list" | "pie">("list");
  const [active, setActive] = useState<number | null>(null);

  return (
    <ExpandableChartCard
      className={className}
      title={t("title")}
      description={t(average ? "descriptionAvg" : "description")}
      actions={
        items.length > 0 && (
          <>
            <Button size="icon-sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} aria-label={t("viewList")} aria-pressed={view === "list"}>
              <List />
            </Button>
            <Button size="icon-sm" variant={view === "pie" ? "secondary" : "ghost"} onClick={() => setView("pie")} aria-label={t("viewPie")} aria-pressed={view === "pie"}>
              <ChartPie />
            </Button>
          </>
        )
      }
    >
      {(expanded) => {
        if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
        // Full view has room for both: a large pie next to the complete list.
        if (expanded)
          return (
            <div className="grid min-h-0 flex-1 content-start items-center gap-6 overflow-y-auto lg:content-center lg:grid-cols-[auto_1fr] lg:overflow-visible">
              <Pie items={items} active={active} onActive={setActive} average={average} className="size-[min(70vw,50vh,460px)]" />
              <PieLegend items={items} active={active} onActive={setActive} className="self-stretch lg:max-h-full lg:overflow-y-auto" />
            </div>
          );
        if (view === "list") return <CategoryBars items={items} average={average} />;
        return (
          <div className="flex flex-col items-center gap-4">
            <Pie items={items} active={active} onActive={setActive} average={average} />
            <PieLegend items={items} active={active} onActive={setActive} className="max-h-64" />
          </div>
        );
      }}
    </ExpandableChartCard>
  );
}
