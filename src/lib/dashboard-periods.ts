/** Dashboard periods, shared by the server queries and the client period controls. */

import { differenceInCalendarDays, isValid, parseISO } from "date-fns";

export type PresetPeriod = "1w" | "1m" | "3m" | "6m" | "12m" | "all";
/** A single calendar month (`yyyy-MM`). */
export type MonthPeriod = `${number}-${number}`;
/** A single calendar year (`yyyy`). */
export type YearPeriod = `${number}`;
/** A custom date range (`yyyy-MM-dd_yyyy-MM-dd`, both inclusive), at least {@link MIN_RANGE_DAYS} long. */
export type RangePeriod = `${string}_${string}`;
export type Period = PresetPeriod | MonthPeriod | YearPeriod | RangePeriod;

/** Labels: messages/<locale>/dashboard.json `periods.<value>` (full) and `periodsShort.<value>` (pills). */
export const PERIODS: PresetPeriod[] = ["1w", "1m", "3m", "6m", "12m", "all"];

export const DEFAULT_PERIOD: PresetPeriod = "6m";

/** Custom ranges must cover at least one week. */
export const MIN_RANGE_DAYS = 7;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isPresetPeriod = (period: string): period is PresetPeriod => PERIODS.includes(period as PresetPeriod);
export const isMonthPeriod = (period: string): period is MonthPeriod => /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
export const isYearPeriod = (period: string): period is YearPeriod => /^\d{4}$/.test(period);

export const rangePeriod = (from: string, to: string): RangePeriod => `${from}_${to}`;

/** The inclusive bounds of a custom range, or null when malformed, reversed or shorter than a week. */
export function parseRangePeriod(period: string): { from: string; to: string } | null {
  const [from, to, ...rest] = period.split("_");
  if (rest.length || !from || !to || !DATE.test(from) || !DATE.test(to)) return null;
  const [start, end] = [parseISO(from), parseISO(to)];
  if (!isValid(start) || !isValid(end) || differenceInCalendarDays(end, start) + 1 < MIN_RANGE_DAYS) return null;
  return { from, to };
}

/** How flows are shown: the period's totals, or the average per month with data (`view=avg`). */
export type DashboardView = "total" | "avg";

export const parseView = (value: string | undefined | null): DashboardView => (value === "avg" ? "avg" : "total");

export function parsePeriod(value: string | undefined | null): Period {
  if (!value) return DEFAULT_PERIOD;
  if (isPresetPeriod(value) || isMonthPeriod(value) || isYearPeriod(value)) return value;
  if (parseRangePeriod(value)) return value as RangePeriod;
  return DEFAULT_PERIOD;
}
