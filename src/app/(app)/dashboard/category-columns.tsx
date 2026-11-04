"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ExpandableChartCard } from "@/components/charts/expandable-chart-card";
import { CATEGORY_TEXT, CategoryIcon, categoryTint } from "@/components/transactions/category-label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CategorySlice } from "./category-breakdown";

const wholeEuros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });

/** Round axis maximum and step (1/2/2.5/5 × 10ⁿ) so there are about four gridlines. */
function axisScale(maxCents: number, lines = 4) {
  const raw = Math.max(maxCents, 100) / lines;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const top = Math.ceil(maxCents / step) * step || step;
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

/** Category tint over an opaque popover background, so the tooltip stays legible above the chart. */
function tooltipTint(color: string) {
  const border = `color-mix(in srgb, ${color} 55%, transparent)`;
  const bg = `linear-gradient(color-mix(in srgb, ${color} 15%, transparent), color-mix(in srgb, ${color} 15%, transparent)), var(--popover)`;
  return { "--category": color, "--tip-border": border, "--tip-bg": bg, borderColor: border, background: bg } as React.CSSProperties;
}

function Column({ c, top }: { c: CategorySlice; top: number }) {
  const t = useTranslations("dashboard.ranking");
  // The whole column is the hover/focus target, but the tooltip is anchored to the bar so it
  // sits just above its tip (past the value label) instead of at the top of the plot.
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open}>
      <Link
        href={c.href}
        className="group relative h-full min-w-9 flex-1"
        aria-label={`${c.name}: ${formatMoney(c.cents)}`}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <TooltipTrigger asChild>
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-14" style={{ height: `${(c.cents / top) * 100}%` }}>
            <span className="absolute inset-x-0 -top-5 text-center text-[11px] font-medium whitespace-nowrap tabular-nums">{wholeEuros.format(c.cents / 100)}</span>
            <div className="h-full min-h-px rounded-t-md border border-b-0 transition-[filter] group-hover:brightness-125" style={categoryTint(c.color)} />
          </div>
        </TooltipTrigger>
      </Link>
      <TooltipContent
        side="top"
        sideOffset={24}
        // Same tint as the column; the arrow reuses it and draws the border on its two outer edges.
        className="flex-col items-start gap-0.5 border text-popover-foreground shadow-md [&_svg]:fill-transparent [&_svg]:border-r [&_svg]:border-b [&_svg]:border-(--tip-border) [&_svg]:[background:var(--tip-bg)]"
        style={tooltipTint(c.color)}
      >
        <span className={cn("font-medium", CATEGORY_TEXT)}>{c.name}</span>
        <span className="tabular-nums">
          {formatMoney(c.cents)} · {Math.round(c.pct * 100)}%
        </span>
        {c.reimbursed > 0 && <span className="tabular-nums opacity-80">{t("netOf", { spent: formatMoney(c.spent), reimbursed: formatMoney(c.reimbursed) })}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

function Columns({ items, expanded }: { items: CategorySlice[]; expanded: boolean }) {
  const { top, ticks } = axisScale(Math.max(...items.map((c) => c.cents)));

  return (
    <div className={cn("flex flex-col gap-3", expanded ? "min-h-0 flex-1" : "h-80")}>
      <div className="flex min-h-0 flex-1 overflow-x-auto">
        {/* Y axis labels */}
        <div className="mb-8 w-16 shrink-0 pt-5" aria-hidden>
          <div className="relative h-full">
            {ticks.map((v) => (
              <span key={v} className="absolute right-2 translate-y-1/2 text-[11px] text-muted-foreground tabular-nums" style={{ bottom: `${(v / top) * 100}%` }}>
                {wholeEuros.format(v / 100)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col" style={{ minWidth: `${items.length * 3}rem` }}>
          {/* Plot: gridlines behind the columns; the top padding leaves room for the value labels. */}
          <div className="relative min-h-0 flex-1 pt-5">
            <div className="relative h-full">
              {ticks.map((v) => (
                <div key={v} className={cn("absolute inset-x-0 border-t", v === 0 ? "border-border" : "border-dashed border-border/60")} style={{ bottom: `${(v / top) * 100}%` }} />
              ))}
              <div className="absolute inset-0 flex gap-1.5 px-1 sm:gap-3">
                {items.map((c) => (
                  <Column key={c.key} c={c} top={top} />
                ))}
              </div>
            </div>
          </div>
          {/* X axis: category icon under each column; the name is in the tooltip and aria-label. */}
          <div className="flex h-8 shrink-0 gap-1.5 px-1 pt-2 sm:gap-3">
            {items.map((c) => (
              <div key={c.key} className={cn("flex min-w-9 flex-1 justify-center", CATEGORY_TEXT)} style={{ "--category": c.color } as React.CSSProperties} title={c.name}>
                <CategoryIcon icon={c.icon} className="size-4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Vertical bar per category (net spending; gross and reimbursed in the tooltip) to compare categories side by side. */
export function CategoryColumnsCard({ items, average = false, className }: { items: CategorySlice[]; average?: boolean; className?: string }) {
  const t = useTranslations("dashboard.categoryChart");
  const tr = useTranslations("dashboard.ranking");
  return (
    <ExpandableChartCard className={className} title={t("title")} description={t(average ? "descriptionAvg" : "description")}>
      {(expanded) => (items.length === 0 ? <p className="text-sm text-muted-foreground">{tr("empty")}</p> : <Columns items={items} expanded={expanded} />)}
    </ExpandableChartCard>
  );
}
