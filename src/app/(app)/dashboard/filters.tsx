"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeriodPresets, useDashboardParams } from "./period-picker";

export function DashboardFilters({
  scopes,
  months,
  range,
}: {
  scopes: { value: string; label: string }[];
  /** Months with data (`yyyy-MM`), newest first. */
  months: string[];
  /** The range currently shown (`yyyy-MM-dd`), used to prefill the custom date range. */
  range: { start: string; end: string };
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
      </div>
    </div>
  );
}
