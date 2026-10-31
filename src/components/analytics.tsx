"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";

/** Vercel Web Analytics. Query strings are dropped so search terms and filters never leave the app. */
export function Analytics() {
  return <VercelAnalytics beforeSend={(event) => ({ ...event, url: event.url.split("?")[0]! })} />;
}
