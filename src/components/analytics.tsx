"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const stripQuery = <T extends { url: string }>(event: T): T => ({ ...event, url: event.url.split("?")[0]! });

/** Vercel Web Analytics and Speed Insights. Query strings are dropped so search terms and filters never leave the app. */
export function Analytics() {
  return (
    <>
      <VercelAnalytics beforeSend={stripQuery} />
      <SpeedInsights beforeSend={stripQuery} />
    </>
  );
}
