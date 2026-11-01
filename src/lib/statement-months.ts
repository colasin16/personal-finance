/** Month helpers for browsing statements on the Import page (months are `yyyy-MM`). */

type Dated = { periodStart: string | null; periodEnd: string | null };

export const isMonthParam = (v?: string | null): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

/** First and last day of a month, as `yyyy-MM-dd`. */
export const monthBounds = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
};

/** Whether the statement's period touches `month` — the same rule as the completeness grid. */
export const coversMonth = (s: Dated, month: string) =>
  !!s.periodStart && !!s.periodEnd && s.periodStart.slice(0, 7) <= month && s.periodEnd.slice(0, 7) >= month;

/** Statements still waiting on the user or the pipeline: anything not confirmed, or without an account or period. */
export const needsAttention = (s: Dated & { status: string; accountId: string | null }) =>
  s.status !== "confirmed" || !s.accountId || !s.periodStart || !s.periodEnd;

/**
 * One row per account for `month`: its statements covering the month, and whether the month is a gap (after the
 * account's first statement, like the completeness grid). Statements of accounts not in the list (e.g. archived)
 * are returned in `others`.
 */
export function monthSlots<A extends { id: string; firstMonth: string | null }, S extends Dated & { accountId: string | null }>(
  month: string,
  accounts: A[],
  statements: S[],
) {
  const covering = statements.filter((s) => coversMonth(s, month));
  const ids = new Set(accounts.map((a) => a.id));
  return {
    slots: accounts.map((account) => {
      const own = covering.filter((s) => s.accountId === account.id);
      return { account, statements: own, missing: own.length === 0 && !!account.firstMonth && month >= account.firstMonth };
    }),
    others: covering.filter((s) => !s.accountId || !ids.has(s.accountId)),
  };
}
