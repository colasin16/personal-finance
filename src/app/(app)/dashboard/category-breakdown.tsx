"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChartPie, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type CategorySlice = { key: string; name: string; color: string; cents: number; count: number; pct: number; href: string };

const STROKE = 36;
const HOVER_GROW = 8;
// Room around the ring so a hovered (thicker) slice is never clipped.
const PAD = 12;
const SIZE = 220 + PAD * 2;
const R = (SIZE - STROKE) / 2 - PAD;
const CIRCUMFERENCE = 2 * Math.PI * R;
// Small visual gap between slices, skipped when there is only one slice.
const GAP = 2;

function Pie({ items, active, onActive }: { items: CategorySlice[]; active: number | null; onActive: (i: number | null) => void }) {
  const t = useTranslations("dashboard.ranking");
  const router = useRouter();
  const total = items.reduce((sum, c) => sum + c.cents, 0);
  const focus = active === null ? null : items[active];
  const gap = items.length > 1 ? GAP : 0;
  const starts = items.map((_, i) => items.slice(0, i).reduce((sum, c) => sum + c.pct * CIRCUMFERENCE, 0));

  return (
    <div className="relative mx-auto size-[244px] shrink-0">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" role="img" aria-label={t("pieLabel")}>
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
        <span className="line-clamp-2 text-xs text-muted-foreground">{focus ? focus.name : t("total")}</span>
        <Money cents={focus ? focus.cents : total} className="text-lg font-semibold" />
        {focus && <span className="text-xs text-muted-foreground">{Math.round(focus.pct * 100)}%</span>}
      </div>
    </div>
  );
}

export function CategoryBreakdown({ items, className }: { items: CategorySlice[]; className?: string }) {
  const t = useTranslations("dashboard.ranking");
  const [view, setView] = useState<"list" | "pie">("list");
  const [active, setActive] = useState<number | null>(null);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        {items.length > 0 && (
          <CardAction className="flex gap-1">
            <Button size="icon-sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} aria-label={t("viewList")} aria-pressed={view === "list"}>
              <List />
            </Button>
            <Button size="icon-sm" variant={view === "pie" ? "secondary" : "ghost"} onClick={() => setView("pie")} aria-label={t("viewPie")} aria-pressed={view === "pie"}>
              <ChartPie />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}

        {items.length > 0 && view === "list" && (
          <div className="space-y-3">
            {items.map((c) => (
              <Link key={c.key} href={c.href} className="group -m-1 block space-y-1 rounded-md p-1 hover:bg-muted/60">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                    {c.name}
                    <span className="text-xs text-muted-foreground">{t("count", { count: c.count })}</span>
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
          </div>
        )}

        {items.length > 0 && view === "pie" && (
          <div className="flex flex-col items-center gap-4">
            <Pie items={items} active={active} onActive={setActive} />
            <ul className="max-h-64 w-full space-y-0.5 overflow-y-auto pr-1">
              {items.map((c, i) => (
                <li key={c.key}>
                  <Link
                    href={c.href}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60", active === i && "bg-muted/60")}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{Math.round(c.pct * 100)}%</span>
                    <Money cents={c.cents} className="w-24 text-right font-medium" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
