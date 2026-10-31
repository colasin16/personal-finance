"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";
import {
  AreaSeries,
  BaselineSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type ISeriesApi,
  type SeriesMarker,
  type SeriesType,
  TickMarkType,
  type Time,
} from "lightweight-charts";
import { intlLocale } from "@/i18n/config";

/** Values are integer cents; dates are "YYYY-MM-DD". */
export type ChartPoint = { time: string; value: number; color?: string };

export type ChartSeries =
  | { kind: "area"; data: ChartPoint[]; color: string; title?: string }
  | { kind: "line"; data: ChartPoint[]; color: string; title?: string; lineWidth?: 1 | 2 | 3 | 4; dashed?: boolean }
  | { kind: "histogram"; data: ChartPoint[]; color: string; title?: string }
  | { kind: "baseline"; data: ChartPoint[]; title?: string };

export type ChartMarker = { time: string; text: string; color: string; position?: "aboveBar" | "belowBar" | "inBar"; shape?: "arrowDown" | "arrowUp" | "circle" | "square" };

const toData = (points: ChartPoint[]) =>
  points.map((p) => ({ time: p.time as Time, value: p.value / 100, ...(p.color ? { color: p.color } : {}) }));

/**
 * Thin React wrapper around TradingView Lightweight Charts™ (v5). Renders client-side only,
 * resizes with its container and cleans up on unmount.
 */
export function TimeChart({
  series,
  markers,
  height = 280,
  currency = "EUR",
  locale = "es-ES",
  monthly = false,
}: {
  series: ChartSeries[];
  markers?: ChartMarker[];
  /** Pixels, or any CSS height (e.g. "100%") to fill a sized parent. */
  height?: number | string;
  currency?: string;
  /** Locale for money formatting; date labels follow the active app locale. */
  locale?: string;
  monthly?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const dark = useTheme().resolvedTheme === "dark";
  const dateLocale = intlLocale(useLocale());

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const money = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0, useGrouping: "always" });
    const compact = new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
    const monthFmt = new Intl.DateTimeFormat(dateLocale, { month: "short", year: "2-digit" });
    const dayFmt = new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short", year: "numeric" });
    const tickYear = new Intl.DateTimeFormat(dateLocale, { year: "numeric" });
    const tickMonth = new Intl.DateTimeFormat(dateLocale, { month: "short" });
    const tickDay = new Intl.DateTimeFormat(dateLocale, { day: "numeric" });
    const asDate = (t: Time) =>
      typeof t === "string" ? new Date(`${t}T00:00:00`) : typeof t === "number" ? new Date(t * 1000) : new Date(t.year, t.month - 1, t.day);

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: dark ? "#a1a1aa" : "#71717a",
        fontFamily: "var(--font-sans), ui-sans-serif, system-ui",
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? "#27272a" : "#f1f1f4" } },
      rightPriceScale: { borderVisible: false, minimumWidth: 64, scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: true,
        tickMarkFormatter: (t: Time, type: TickMarkType) => {
          const d = asDate(t);
          if (type === TickMarkType.Year) return tickYear.format(d);
          if (type === TickMarkType.Month) return tickMonth.format(d).replace(".", "");
          return tickDay.format(d);
        },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { labelBackgroundColor: dark ? "#3f3f46" : "#18181b" },
        horzLine: { labelBackgroundColor: dark ? "#3f3f46" : "#18181b" },
      },
      handleScroll: false,
      handleScale: false,
      localization: {
        priceFormatter: (v: number) => money.format(v),
        timeFormatter: (t: Time) => (monthly ? monthFmt : dayFmt).format(asDate(t)),
      },
    });

    let first: ISeriesApi<SeriesType> | null = null;
    for (const s of series) {
      let api: ISeriesApi<SeriesType>;
      const common = { title: s.title ?? "", lastValueVisible: false, priceLineVisible: false, priceFormat: { type: "custom" as const, formatter: (v: number) => compact.format(v) } };
      if (s.kind === "area") {
        api = chart.addSeries(AreaSeries, { ...common, lineColor: s.color, topColor: `${s.color}55`, bottomColor: `${s.color}05`, lineWidth: 2 });
      } else if (s.kind === "line") {
        api = chart.addSeries(LineSeries, { ...common, color: s.color, lineWidth: s.lineWidth ?? 2, lineStyle: s.dashed ? 2 : 0 });
      } else if (s.kind === "histogram") {
        api = chart.addSeries(HistogramSeries, { ...common, color: s.color });
      } else {
        api = chart.addSeries(BaselineSeries, {
          ...common,
          baseValue: { type: "price", price: 0 },
          topLineColor: "#059669",
          topFillColor1: "#05966933",
          topFillColor2: "#05966905",
          bottomLineColor: "#dc2626",
          bottomFillColor1: "#dc262605",
          bottomFillColor2: "#dc262633",
        });
      }
      api.setData(toData(s.data));
      first ??= api;
    }
    if (first && markers?.length) {
      createSeriesMarkers(
        first,
        markers.map<SeriesMarker<Time>>((m) => ({
          time: m.time as Time,
          text: m.text,
          color: m.color,
          position: m.position ?? "aboveBar",
          shape: m.shape ?? "arrowDown",
        })),
      );
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [series, markers, currency, locale, dateLocale, monthly, dark]);

  return <div ref={container} style={{ height }} className="w-full" />;
}
