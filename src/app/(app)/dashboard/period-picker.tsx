"use client";

import { useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { intlLocale } from "@/i18n/config";
import {
  isMonthPeriod,
  isPresetPeriod,
  isYearPeriod,
  MIN_RANGE_DAYS,
  parsePeriod,
  parseRangePeriod,
  PERIODS,
  rangePeriod,
} from "@/lib/dashboard-periods";
import { formatDate, formatMonth } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Reads and updates the dashboard's URL params (`scope`, `period`, `view`), which the server uses to render every card. */
export function useDashboardParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const period = parsePeriod(params.get("period"));
  // Reflect the clicked period straight away while the dashboard re-renders for it.
  const [optimisticPeriod, setOptimisticPeriod] = useOptimistic<string>(period);
  const set = (key: "scope" | "period" | "view", value: string) =>
    startTransition(() => {
      if (key === "period") setOptimisticPeriod(value);
      const next = new URLSearchParams(params);
      next.set(key, value);
      router.replace(`${pathname}?${next}`, { scroll: false });
    });
  return { params, set, period: optimisticPeriod };
}

const pillClass = (active: boolean) =>
  cn(
    "h-7 min-w-9 px-2 text-xs text-muted-foreground hover:bg-background/60",
    active && "bg-background text-foreground shadow-sm hover:bg-background",
  );

/**
 * Segmented period switcher (1W … All). It always drives the dashboard-wide `period`, so every card shows the same
 * range. Pass `months` to add the "Custom" picker for a specific month, year or date range.
 */
export function PeriodPresets({ months, range }: { months?: string[]; range?: { start: string; end: string } }) {
  const t = useTranslations("dashboard.periods");
  const ts = useTranslations("dashboard.periodsShort");
  const { period, set } = useDashboardParams();
  return (
    <div role="group" aria-label={t("label")} className="flex flex-wrap items-center gap-0.5 rounded-md bg-muted p-0.5">
      {PERIODS.map((p) => (
        <Button
          key={p}
          size="sm"
          variant="ghost"
          aria-pressed={period === p}
          aria-label={t(p)}
          title={t(p)}
          onClick={() => set("period", p)}
          className={pillClass(period === p)}
        >
          {ts(p)}
        </Button>
      ))}
      {months && range && <CustomPeriod period={period} months={months} range={range} onChange={(p) => set("period", p)} />}
    </div>
  );
}

function CustomPeriod({
  period,
  months,
  range,
  onChange,
}: {
  period: string;
  /** Months with data (`yyyy-MM`), newest first. */
  months: string[];
  /** The range currently shown, used to prefill the date-range form. */
  range: { start: string; end: string };
  onChange: (period: string) => void;
}) {
  const t = useTranslations("dashboard.periods");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const custom = parseRangePeriod(period);
  const active = !isPresetPeriod(period);

  const label = isMonthPeriod(period)
    ? formatMonth(period, "long", locale)
    : isYearPeriod(period)
      ? period
      : custom
        ? `${formatDate(custom.from, locale)} – ${formatDate(custom.to, locale)}`
        : t("custom");

  // Step through months/years that have data (lists are newest first).
  const steps = isMonthPeriod(period) ? months : isYearPeriod(period) ? years : null;
  const index = steps?.indexOf(period) ?? -1;
  const isMonth = isMonthPeriod(period);

  const choose = (p: string) => {
    setOpen(false);
    onChange(p);
  };

  return (
    <div className={cn("flex items-center rounded-md", active && "bg-background shadow-sm")}>
      {steps && (
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={index < 0 || index === steps.length - 1}
          onClick={() => onChange(steps[index + 1]!)}
          aria-label={t(isMonth ? "previousMonth" : "previousYear")}
        >
          <ChevronLeft />
        </Button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" aria-pressed={active} className={cn(pillClass(active), "gap-1 capitalize", active && "shadow-none")}>
            <CalendarDays className="size-3.5" />
            {label}
            <ChevronDown className="size-3 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <CustomPeriodForm period={period} months={months} years={years} range={range} onChoose={choose} />
        </PopoverContent>
      </Popover>
      {steps && (
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={index <= 0}
          onClick={() => onChange(steps[index - 1]!)}
          aria-label={t(isMonth ? "nextMonth" : "nextYear")}
        >
          <ChevronRight />
        </Button>
      )}
    </div>
  );
}

function CustomPeriodForm({
  period,
  months,
  years,
  range,
  onChoose,
}: {
  period: string;
  months: string[];
  years: string[];
  range: { start: string; end: string };
  onChoose: (period: string) => void;
}) {
  const t = useTranslations("dashboard.periods");
  const locale = useLocale();
  const custom = parseRangePeriod(period);
  const [viewYear, setViewYear] = useState(isMonthPeriod(period) || isYearPeriod(period) ? period.slice(0, 4) : (years[0] ?? `${new Date().getFullYear()}`));
  const [from, setFrom] = useState(custom?.from ?? range.start);
  const [to, setTo] = useState(custom?.to ?? range.end);
  const rangeValid = !!from && !!to && differenceInCalendarDays(parseISO(to), parseISO(from)) + 1 >= MIN_RANGE_DAYS;
  const yearIndex = years.indexOf(viewYear);
  const monthName = new Intl.DateTimeFormat(intlLocale(locale), { month: "short" });

  return (
    <Tabs defaultValue={isYearPeriod(period) ? "year" : custom ? "range" : "month"}>
      <TabsList className="w-full">
        <TabsTrigger value="month">{t("month")}</TabsTrigger>
        <TabsTrigger value="year">{t("customYear")}</TabsTrigger>
        <TabsTrigger value="range">{t("customRange")}</TabsTrigger>
      </TabsList>

      <TabsContent value="month" className="space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={yearIndex < 0 || yearIndex === years.length - 1}
            onClick={() => setViewYear(years[yearIndex + 1]!)}
            aria-label={t("previousYear")}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm font-medium tabular-nums">{viewYear}</span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={yearIndex <= 0}
            onClick={() => setViewYear(years[yearIndex - 1]!)}
            aria-label={t("nextYear")}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {Array.from({ length: 12 }, (_, i) => {
            const value = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
            const hasData = months.includes(value);
            return (
              <Button
                key={value}
                size="sm"
                variant={period === value ? "default" : "ghost"}
                disabled={!hasData}
                title={hasData ? formatMonth(value, "long", locale) : t("noData")}
                onClick={() => onChoose(value)}
                className="capitalize"
              >
                {monthName.format(new Date(Number(viewYear), i, 1))}
              </Button>
            );
          })}
        </div>
      </TabsContent>

      <TabsContent value="year" className="pt-2">
        <div className="grid grid-cols-3 gap-1">
          {years.map((y) => (
            <Button key={y} size="sm" variant={period === y ? "default" : "ghost"} onClick={() => onChoose(y)} className="tabular-nums">
              {y}
            </Button>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="range" className="pt-2">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (rangeValid) onChoose(rangePeriod(from, to));
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="period-from" className="text-xs">
                {t("from")}
              </Label>
              <Input id="period-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-to" className="text-xs">
                {t("to")}
              </Label>
              <Input
                id="period-to"
                type="date"
                value={to}
                min={from ? format(addDays(parseISO(from), MIN_RANGE_DAYS - 1), "yyyy-MM-dd") : undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className={cn("text-xs", rangeValid ? "text-muted-foreground" : "text-destructive")}>{t("minRange")}</p>
            <Button type="submit" size="sm" disabled={!rangeValid}>
              {t("apply")}
            </Button>
          </div>
        </form>
      </TabsContent>
    </Tabs>
  );
}
