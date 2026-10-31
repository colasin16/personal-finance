"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonth } from "@/lib/labels";
import type { PresetPeriod } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function DashboardFilters({
  scopes,
  periods,
  months,
}: {
  scopes: { value: string; label: string }[];
  periods: PresetPeriod[];
  /** Months with data (`yyyy-MM`), newest first. */
  months: string[];
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const period = params.get("period") ?? "6m";
  // Keep a month without data (e.g. from an old link) selectable so the trigger still shows its label.
  const selectableMonths = /^\d{4}-\d{2}$/.test(period) && !months.includes(period) ? [period, ...months] : months;
  const monthIndex = months.indexOf(period);
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
        <div className="flex items-center gap-1">
          {monthIndex >= 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={monthIndex === months.length - 1}
              onClick={() => set("period", months[monthIndex + 1]!)}
              aria-label={t("periods.previousMonth")}
            >
              <ChevronLeft />
            </Button>
          )}
          <Select value={period} onValueChange={(v) => set("period", v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`periods.${p}`)}
                </SelectItem>
              ))}
              {selectableMonths.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>{t("periods.month")}</SelectLabel>
                    {selectableMonths.map((m) => (
                      <SelectItem key={m} value={m}>
                        <span className="capitalize">{formatMonth(m, "long", locale)}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>
          {monthIndex >= 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={monthIndex === 0}
              onClick={() => set("period", months[monthIndex - 1]!)}
              aria-label={t("periods.nextMonth")}
            >
              <ChevronRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
