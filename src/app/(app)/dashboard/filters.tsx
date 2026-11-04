"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeriodPresets, useDashboardParams } from "./period-picker";

export function DashboardFilters({
  scopes,
  months,
  range,
  average,
}: {
  scopes: { value: string; label: string }[];
  /** Months with data (`yyyy-MM`), newest first. */
  months: string[];
  /** The range currently shown (`yyyy-MM-dd`), used to prefill the custom date range. */
  range: { start: string; end: string };
  /** Monthly-average state from the server: divisor, whether the range allows it and whether it's applied. */
  average: { months: number; available: boolean; active: boolean };
}) {
  const t = useTranslations("dashboard");
  const { params, set } = useDashboardParams();
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={params.get("scope") ?? "household"} onValueChange={(v) => set("scope", v)}>
          <TabsList>
            {scopes.map((s) => (
              <TabsTrigger key={s.value} value={s.value}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <PeriodPresets months={months} range={range} />
        {/* Separate from the period: the dates pick the range, this picks how the range is summarised. */}
        <div role="group" aria-label={t("view.label")} className="flex items-center gap-1.5" title={average.available ? undefined : t("view.unavailable")}>
          <span className="text-xs text-muted-foreground">{t("view.label")}</span>
          <Tabs value={average.active ? "avg" : "total"} onValueChange={(v) => set("view", v)}>
            <TabsList>
              <TabsTrigger value="total">{t("view.total")}</TabsTrigger>
              <TabsTrigger value="avg" disabled={!average.available}>
                {t("view.average")}
                {average.active && (
                  <span className="rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700 tabular-nums dark:bg-emerald-950 dark:text-emerald-300">
                    ÷{average.months}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
