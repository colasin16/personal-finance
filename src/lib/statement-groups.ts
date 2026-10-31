/** Grouping and filtering of the statement list on the Import page, by period month, account and status. */

export type GroupableStatement = {
  fileName: string;
  status: string;
  accountId: string | null;
  account: { name: string } | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type StatementFilter = { month?: string; accountId?: string; status?: string };

export const isMonthParam = (v?: string | null): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

const monthOf = (date: string) => date.slice(0, 7);

/** The month a statement is listed under: the month its period starts in, or `null` while it isn't dated yet. */
export const statementMonth = (s: Pick<GroupableStatement, "periodStart" | "periodEnd">) =>
  s.periodStart ? monthOf(s.periodStart) : s.periodEnd ? monthOf(s.periodEnd) : null;

/** Whether the statement's period covers any day of `month` (`yyyy-MM`), matching the completeness grid. */
export const coversMonth = (s: Pick<GroupableStatement, "periodStart" | "periodEnd">, month: string) => {
  const start = s.periodStart ?? s.periodEnd;
  const end = s.periodEnd ?? s.periodStart;
  return !!start && !!end && monthOf(start) <= month && monthOf(end) >= month;
};

export const filterStatements = <T extends GroupableStatement>(items: T[], f: StatementFilter) =>
  items.filter(
    (s) => (!f.month || coversMonth(s, f.month)) && (!f.accountId || s.accountId === f.accountId) && (!f.status || s.status === f.status),
  );

/** Months that have statements, newest first. */
export const statementMonths = (items: GroupableStatement[]) =>
  [...new Set(items.map(statementMonth).filter((m): m is string => !!m))].sort().reverse();

/**
 * Groups statements by period month, newest first, with undated ones (still processing, failed, no account) on top.
 * Inside a month, statements are ordered by account and then file name. With a month filter, everything that covers
 * that month is listed under it.
 */
export function groupStatements<T extends GroupableStatement>(items: T[], month?: string) {
  const groups = new Map<string | null, T[]>();
  for (const s of items) {
    const key = month ?? statementMonth(s);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const byAccount = (a: T, b: T) =>
    (a.account?.name ?? "").localeCompare(b.account?.name ?? "") || (a.periodStart ?? "").localeCompare(b.periodStart ?? "") || a.fileName.localeCompare(b.fileName);
  return [...groups.entries()]
    .sort(([a], [b]) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : b.localeCompare(a)))
    .map(([month, items]) => ({ month, items: items.sort(byAccount), allConfirmed: items.every((s) => s.status === "confirmed") }));
}
