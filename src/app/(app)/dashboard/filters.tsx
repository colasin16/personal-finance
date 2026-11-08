"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PeriodPresets, useDashboardParams } from "./period-picker";

type Scope = { value: string; label: string };
type Average = { months: number; available: boolean; active: boolean };

/**
 * From `md` up: scope tabs, period presets and the total/average toggle in one row next to the title. Below `md` only
 * the period stays inline; scope and total/average move into a bottom sheet opened from a compact button in the title
 * row, which shows the current scope (and the ÷N divisor when averaging) so the state stays visible.
 */
export function DashboardFilters({
  scopes,
  months,
  range,
  average,
}: {
  scopes: Scope[];
  /** Months with data (`yyyy-MM`), newest first. */
  months: string[];
  /** The range currently shown (`yyyy-MM-dd`), used to prefill the custom date range. */
  range: { start: string; end: string };
  /** Monthly-average state from the server: divisor, whether the range allows it and whether it's applied. */
  average: Average;
}) {
  const t = useTranslations("dashboard");
  const { params, set } = useDashboardParams();
  const scope = params.get("scope") ?? "household";
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 md:gap-y-4">
      {/* Below `xl` the scope tabs share the title row, leaving the row underneath to the period and view. */}
      <div className="flex w-full items-center justify-between gap-4 xl:w-auto">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <MobileViewOptions scopes={scopes} scope={scope} average={average} onChange={set} />
        <ScopeTabs scopes={scopes} scope={scope} onChange={(v) => set("scope", v)} className="hidden md:flex xl:hidden" />
      </div>
      {/* From `xl` up: sits beside the title when it fits, otherwise drops below it as a whole. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <ScopeTabs scopes={scopes} scope={scope} onChange={(v) => set("scope", v)} className="hidden xl:flex" />
        {/* One swipeable row on phones instead of wrapping when a specific month or range is picked. */}
        <PeriodPresets months={months} range={range} className="no-scrollbar relative max-w-full flex-nowrap overflow-x-auto md:flex-wrap md:overflow-visible" />
        {/* Separate from the period: the dates pick the range, this picks how the range is summarised. */}
        <div role="group" aria-label={t("view.label")} className="hidden items-center gap-1.5 md:flex" title={average.available ? undefined : t("view.unavailable")}>
          <span className="text-xs text-muted-foreground">{t("view.label")}</span>
          <ViewTabs average={average} onChange={(v) => set("view", v)} />
        </div>
      </div>
    </div>
  );
}

function ScopeTabs({ scopes, scope, onChange, className }: { scopes: Scope[]; scope: string; onChange: (scope: string) => void; className?: string }) {
  return (
    <Tabs value={scope} onValueChange={onChange} className={className}>
      <TabsList>
        {scopes.map((s) => (
          <TabsTrigger key={s.value} value={s.value}>
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function ViewTabs({ average, onChange, className }: { average: Average; onChange: (view: string) => void; className?: string }) {
  const t = useTranslations("dashboard");
  return (
    <Tabs value={average.active ? "avg" : "total"} onValueChange={onChange} className={className}>
      <TabsList className={cn(className && "w-full")}>
        <TabsTrigger value="total">{t("view.total")}</TabsTrigger>
        <TabsTrigger value="avg" disabled={!average.available}>
          {t("view.average")}
          {average.active && <AverageBadge months={average.months} />}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function AverageBadge({ months }: { months: number }) {
  return (
    <span className="rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700 tabular-nums dark:bg-emerald-950 dark:text-emerald-300">
      ÷{months}
    </span>
  );
}

function MobileViewOptions({
  scopes,
  scope,
  average,
  onChange,
}: {
  scopes: Scope[];
  scope: string;
  average: Average;
  onChange: (key: "scope" | "view", value: string) => void;
}) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);
  const current = scopes.find((s) => s.value === scope) ?? scopes[0];
  return (
    <>
      <Button variant="outline" size="sm" className="max-w-[60%] md:hidden" onClick={() => setOpen(true)} aria-label={`${t("options.title")}: ${current?.label}`}>
        <SlidersHorizontal />
        <span className="truncate">{current?.label}</span>
        {average.active && <AverageBadge months={average.months} />}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 gap-0 rounded-b-none p-0 pb-[env(safe-area-inset-bottom)] sm:max-w-none md:hidden data-open:zoom-in-100 data-open:slide-in-from-bottom-8 data-closed:zoom-out-100 data-closed:slide-out-to-bottom-8">
          <DialogHeader className="border-b p-4 pr-12">
            <DialogTitle>{t("options.title")}</DialogTitle>
            <DialogDescription className="sr-only">{t("options.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 p-4">
            <section className="space-y-2">
              <p className="text-sm font-medium">{t("scope.label")}</p>
              <div role="radiogroup" aria-label={t("scope.label")} className="divide-y rounded-lg border">
                {scopes.map((s) => {
                  const selected = s.value === scope;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onChange("scope", s.value)}
                      className={cn("flex h-11 w-full items-center justify-between px-3 text-left text-sm", selected && "font-medium")}
                    >
                      {s.label}
                      {selected && <Check className="size-4 text-emerald-600" />}
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="space-y-2">
              <p className="text-sm font-medium">{t("view.label")}</p>
              <ViewTabs average={average} onChange={(v) => onChange("view", v)} className="w-full" />
              {/* The desktop tooltip doesn't work on touch, so explain inline why averages are off. */}
              {!average.available && <p className="text-xs text-muted-foreground">{t("view.unavailable")}</p>}
            </section>
          </div>
          <DialogFooter className="m-0 border-t p-4">
            <Button className="w-full" onClick={() => setOpen(false)}>
              {t("options.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
