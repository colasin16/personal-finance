import { localizeCategoryName } from "@/lib/i18n/categories";
import { addDays, differenceInCalendarDays, endOfMonth, endOfYear, format, max, min, parseISO, startOfMonth, startOfWeek, subMonths, subYears } from "date-fns";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  accountOwners,
  accounts,
  banks,
  categories,
  categoryRules,
  dismissedSuggestions,
  statements,
  transactions,
  users,
  type Category,
} from "@/lib/db/schema";
import { findTransferSuggestions } from "@/lib/pipeline/categorize";
import { applyShare } from "@/lib/money";
import { netCashFlow } from "@/lib/domain/cashflow";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { isMonthPeriod, isYearPeriod, parseRangePeriod, type DashboardView, type Period } from "@/lib/dashboard-periods";
import { monthBounds } from "@/lib/statement-months";

/* ───────────────────────────── Accounts & visibility ───────────────────────────── */

export type AccountOwner = { userId: string; displayName: string; sharePct: number };

/**
 * Accounts the user may see: every non-private household account plus private accounts they own.
 * Partners see each other's personal accounts by default (the plan's "transparent household" model).
 */
export async function getVisibleAccounts(db: Db, householdId: string, userId: string, { includeArchived = false } = {}) {
  const rows = await db
    .select({ account: accounts, bankName: banks.name, bankColor: banks.color })
    .from(accounts)
    .innerJoin(banks, eq(banks.id, accounts.bankId))
    .where(and(eq(accounts.householdId, householdId), includeArchived ? undefined : isNull(accounts.archivedAt)))
    .orderBy(asc(accounts.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.account.id);
  const owners = await db
    .select({ accountId: accountOwners.accountId, userId: accountOwners.userId, sharePct: accountOwners.sharePct, displayName: users.displayName })
    .from(accountOwners)
    .innerJoin(users, eq(users.id, accountOwners.userId))
    .where(inArray(accountOwners.accountId, ids))
    .orderBy(desc(accountOwners.sharePct), asc(users.displayName), asc(accountOwners.userId));

  const balances = await db
    .selectDistinctOn([transactions.accountId], {
      accountId: transactions.accountId,
      balanceCents: transactions.balanceAfterCents,
      bookedAt: transactions.bookedAt,
    })
    .from(transactions)
    .where(inArray(transactions.accountId, ids))
    .orderBy(transactions.accountId, desc(transactions.bookedAt), desc(transactions.position));
  const balanceBy = new Map(balances.map((b) => [b.accountId, b]));

  return rows
    .map(({ account, bankName, bankColor }) => {
      const accountOwnersList: AccountOwner[] = owners
        .filter((o) => o.accountId === account.id)
        .map(({ userId, displayName, sharePct }) => ({ userId, displayName, sharePct }));
      return {
        ...account,
        bankName,
        bankColor,
        owners: accountOwnersList,
        isShared: accountOwnersList.length > 1,
        balanceCents: balanceBy.get(account.id)?.balanceCents ?? null,
        balanceDate: balanceBy.get(account.id)?.bookedAt ?? null,
      };
    })
    .filter((a) => !a.isPrivate || a.owners.some((o) => o.userId === userId));
}

export type VisibleAccount = Awaited<ReturnType<typeof getVisibleAccounts>>[number];

/** "household" = everything at 100%; "shared" = joint accounts; "member:<id>" = that person's share of what they own. */
export type Scope = "household" | "shared" | `member:${string}`;

export function parseScope(value: string | undefined | null): Scope {
  if (value === "shared" || (value && /^member:[0-9a-f-]{36}$/.test(value))) return value as Scope;
  return "household";
}

export function scopeAccounts(list: VisibleAccount[], scope: Scope) {
  if (scope === "household") return list.map((account) => ({ account, sharePct: 100 }));
  if (scope === "shared") return list.filter((a) => a.isShared).map((account) => ({ account, sharePct: 100 }));
  const memberId = scope.slice("member:".length);
  return list.flatMap((account) => {
    const owner = account.owners.find((o) => o.userId === memberId);
    return owner ? [{ account, sharePct: owner.sharePct }] : [];
  });
}

/** Categories with built-in names translated to `locale` (see lib/i18n/categories). */
export async function getCategories(db: Db, householdId: string, locale = "en") {
  const rows = await db.select().from(categories).where(eq(categories.householdId, householdId)).orderBy(asc(categories.kind));
  return rows
    .map((c) => ({ ...c, name: localizeCategoryName(c, locale) }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, locale));
}

/* ───────────────────────────────────── Dashboard ───────────────────────────────────── */

export { DEFAULT_PERIOD, parsePeriod, parseView, PERIODS, type DashboardView, type Period, type PresetPeriod } from "@/lib/dashboard-periods";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const monthKey = (date: string) => date.slice(0, 7);

function periodRange(period: Period, anchor: Date, firstDate: Date) {
  if (isMonthPeriod(period) || isYearPeriod(period)) {
    const year = isYearPeriod(period);
    const start = parseISO(year ? `${period}-01-01` : `${period}-01`);
    const calendarEnd = year ? endOfYear(start) : endOfMonth(start);
    // Don't extend the latest (partial) month/year past the newest data; compare against the same days of the one before.
    const end = anchor >= start && anchor < calendarEnd ? anchor : calendarEnd;
    const prevStart = year ? subYears(start, 1) : subMonths(start, 1);
    const prevEnd = min([addDays(prevStart, differenceInCalendarDays(end, start)), addDays(start, -1)]);
    return { start, end, prevStart, prevEnd };
  }
  const custom = parseRangePeriod(period);
  let start: Date;
  let end = anchor;
  if (custom) [start, end] = [parseISO(custom.from), parseISO(custom.to)];
  else if (period === "all") start = firstDate;
  // Short ranges are rolling windows; longer ones start on a month boundary.
  else if (period === "1w") start = addDays(end, -6);
  else if (period === "1m") start = addDays(subMonths(end, 1), 1);
  else start = startOfMonth(subMonths(end, Number.parseInt(period, 10) - 1));
  if (!custom && start < firstDate) start = period === "1w" || period === "1m" ? firstDate : startOfMonth(firstDate);
  const days = differenceInCalendarDays(end, start) + 1;
  return { start, end, prevStart: addDays(start, -days), prevEnd: addDays(start, -1) };
}

function monthsBetween(from: Date, to: Date) {
  const months: string[] = [];
  for (let m = startOfMonth(from); m <= to; m = startOfMonth(addDays(m, 32))) months.push(format(m, "yyyy-MM"));
  return months;
}

type DashboardTx = {
  id: string;
  accountId: string;
  bookedAt: string;
  amountCents: number;
  balanceAfterCents: number | null;
  categoryId: string | null;
  transferGroupId: string | null;
  merchant: string | null;
  descriptionRaw: string;
};

/**
 * Everything the dashboard shows for a scope and period. With `view = "avg"` the flows (KPIs, categories, merchants)
 * are divided by the number of months with data in the range; net worth stays the latest balance.
 */
export async function getDashboard(db: Db, householdId: string, userId: string, scope: Scope, period: Period, locale = "en", view: DashboardView = "total") {
  const visible = await getVisibleAccounts(db, householdId, userId);
  const inScope = scopeAccounts(visible, scope);
  const shareBy = new Map(inScope.map((s) => [s.account.id, s.sharePct]));
  const cats = await getCategories(db, householdId, locale);
  const catBy = new Map(cats.map((c) => [c.id, c]));

  const txs: DashboardTx[] = inScope.length
    ? await db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          bookedAt: transactions.bookedAt,
          amountCents: transactions.amountCents,
          balanceAfterCents: transactions.balanceAfterCents,
          categoryId: transactions.categoryId,
          transferGroupId: transactions.transferGroupId,
          merchant: transactions.merchant,
          descriptionRaw: transactions.descriptionRaw,
        })
        .from(transactions)
        .where(and(inArray(transactions.accountId, [...shareBy.keys()]), isNull(transactions.excludedAt)))
        .orderBy(asc(transactions.bookedAt), asc(transactions.position))
    : [];

  const latest = txs.length ? parseISO(txs[txs.length - 1]!.bookedAt) : new Date();
  const first = txs.length ? parseISO(txs[0]!.bookedAt) : startOfMonth(new Date());
  const range = periodRange(period, latest, first);
  const [start, end, prevStart, prevEnd] = [iso(range.start), iso(range.end), iso(range.prevStart), iso(range.prevEnd)];

  const share = (tx: DashboardTx) => applyShare(tx.amountCents, shareBy.get(tx.accountId) ?? 100);
  // Transfers between our own accounts are neither income nor spending.
  const isTransfer = (tx: DashboardTx) => tx.transferGroupId !== null || (tx.categoryId !== null && catBy.get(tx.categoryId)?.kind === "transfer");
  const flows = txs.filter((tx) => !isTransfer(tx));
  // Money back into an expense category (e.g. a friend's half of a dinner) reduces that category's spending.
  const isExpenseCategory = (categoryId: string) => catBy.get(categoryId)?.kind === "expense";
  const netFlows = (txsIn: DashboardTx[]) => netCashFlow(txsIn.map((tx) => ({ amount: share(tx), categoryId: tx.categoryId })), isExpenseCategory);

  const inRange = (from: string, to: string) => flows.filter((tx) => tx.bookedAt >= from && tx.bookedAt <= to);
  const summarize = ({ income, expenses }: { income: number; expenses: number }) => ({
    income,
    expenses,
    net: income - expenses,
    savingsRate: income > 0 ? (income - expenses) / income : null,
  });
  // Months that have any transaction (incl. transfers), so gaps without imported statements don't dilute the average.
  const monthsWithData = (from: string, to: string) => new Set(txs.filter((tx) => tx.bookedAt >= from && tx.bookedAt <= to).map((tx) => monthKey(tx.bookedAt))).size;
  const averageMonths = monthsWithData(start, end);
  // Only for ranges long enough to chart month by month, so a rolling month spanning two calendar months isn't halved.
  const averageAvailable = averageMonths > 1 && differenceInCalendarDays(range.end, range.start) + 1 > 62;
  const averaged = view === "avg" && averageAvailable;
  const perMonth = (value: number, n = averageMonths) => (averaged && n > 0 ? Math.round(value / n) : value);
  const countPerMonth = (value: number) => (averaged ? Math.round((value * 10) / averageMonths) / 10 : value);
  const perMonthSummary = (s: ReturnType<typeof summarize>, n = averageMonths) => ({ ...s, income: perMonth(s.income, n), expenses: perMonth(s.expenses, n), net: perMonth(s.net, n) });

  const currentFlows = netFlows(inRange(start, end));
  const current = summarize(currentFlows);
  const previousTotals = txs.length && prevEnd >= iso(first) ? summarize(netFlows(inRange(prevStart, prevEnd))) : null;
  // Both periods are averaged the same way, so the deltas stay like-for-like.
  const previous = previousTotals && perMonthSummary(previousTotals, monthsWithData(prevStart, prevEnd));

  // Income / expenses / net per day (up to two weeks), per week (starting Monday, clamped to the range; up to ~two months) or per month.
  const rangeDays = differenceInCalendarDays(range.end, range.start) + 1;
  const cashFlowGranularity: "month" | "week" | "day" = rangeDays <= 14 ? "day" : rangeDays <= 62 ? "week" : "month";
  const bucketKey =
    cashFlowGranularity === "day"
      ? (date: string) => date
      : cashFlowGranularity === "week"
        ? (date: string) => (date < start ? start : iso(max([startOfWeek(parseISO(date), { weekStartsOn: 1 }), range.start])))
        : (date: string) => `${monthKey(date)}-01`;
  const buckets = new Map<string, { income: number; expenses: number }>();
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
    const key = bucketKey(iso(d));
    if (!buckets.has(key)) buckets.set(key, { income: 0, expenses: 0 });
  }
  const bucketTxs = new Map<string, DashboardTx[]>();
  for (const tx of inRange(start, end)) {
    const key = bucketKey(tx.bookedAt);
    if (!buckets.has(key)) continue;
    const list = bucketTxs.get(key) ?? [];
    list.push(tx);
    bucketTxs.set(key, list);
  }
  for (const [key, list] of bucketTxs) {
    const { income, expenses } = netFlows(list);
    buckets.set(key, { income, expenses });
  }
  const months = [...buckets.entries()].map(([time, v]) => ({ month: monthKey(time), time, ...v, net: v.income - v.expenses }));
  // Reference line for the cash-flow chart: average per bucket that has data (shown in both views).
  const bucketsWithData = new Set(txs.filter((tx) => tx.bookedAt >= start && tx.bookedAt <= end).map((tx) => bucketKey(tx.bookedAt))).size;
  const cashFlowAverage =
    bucketsWithData > 1
      ? { income: Math.round(current.income / bucketsWithData), expenses: Math.round(current.expenses / bucketsWithData), net: Math.round(current.net / bucketsWithData) }
      : null;

  // Daily balances per account (forward-filled), then net worth = Σ balance × share.
  const lastBalanceByDay = new Map<string, Map<string, number>>();
  for (const tx of txs) {
    if (tx.balanceAfterCents === null) continue;
    let byDay = lastBalanceByDay.get(tx.accountId);
    if (!byDay) lastBalanceByDay.set(tx.accountId, (byDay = new Map()));
    byDay.set(tx.bookedAt, tx.balanceAfterCents);
  }
  const accountSeries = inScope
    .filter(({ account }) => lastBalanceByDay.has(account.id))
    .map(({ account, sharePct }) => {
      const byDay = lastBalanceByDay.get(account.id)!;
      const days = [...byDay.keys()].sort();
      let carry: number | null = null;
      for (const d of days) if (d < start) carry = byDay.get(d)!;
      const points: { time: string; value: number }[] = [];
      for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
        const key = iso(d);
        if (byDay.has(key)) carry = byDay.get(key)!;
        if (carry !== null) points.push({ time: key, value: applyShare(carry, sharePct) });
      }
      const ref = { name: account.name, bankId: account.bankId, bankName: account.bankName, bankColor: account.bankColor, ibanLast4: account.ibanLast4 };
      return { accountId: account.id, name: account.name, color: account.bankColor, account: ref, points };
    });
  const netWorthByDay = new Map<string, number>();
  for (const s of accountSeries) for (const p of s.points) netWorthByDay.set(p.time, (netWorthByDay.get(p.time) ?? 0) + p.value);
  const netWorth = [...netWorthByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, value]) => ({ time, value }));
  const netWorthNow = netWorth.at(-1)?.value ?? null;
  const netWorthStart = netWorth[0]?.value ?? null;

  // Category ranking (net of reimbursements) & top merchants (outflows only: a reimbursement comes from someone else)
  const byMerchant = new Map<string, { cents: number; count: number }>();
  for (const tx of inRange(start, end)) {
    const amount = share(tx);
    if (amount >= 0) continue;
    const merchant = tx.merchant || tx.descriptionRaw;
    const mm = byMerchant.get(merchant) ?? { cents: 0, count: 0 };
    mm.cents += -amount;
    mm.count++;
    byMerchant.set(merchant, mm);
  }
  const expenseTotal = current.expenses || 1;
  const categoryRanking = [...currentFlows.byCategory.entries()]
    .filter(([, v]) => v.cents > 0)
    .map(([categoryId, v]) => {
      const cat: Category | undefined = categoryId ? catBy.get(categoryId) : undefined;
      return {
        categoryId,
        /** null = uncategorized; the UI shows the translated label. */
        name: cat?.name ?? null,
        color: cat?.color ?? "#94a3b8",
        icon: cat?.icon ?? "circle-help",
        ...v,
        pct: v.cents / expenseTotal,
        cents: perMonth(v.cents),
        spent: perMonth(v.spent),
        reimbursed: perMonth(v.reimbursed),
        count: countPerMonth(v.count),
      };
    })
    .sort((a, b) => b.cents - a.cents);
  const topMerchants = [...byMerchant.entries()]
    .sort(([, a], [, b]) => b.cents - a.cents)
    .slice(0, 8)
    .map(([name, v]) => ({ name, cents: perMonth(v.cents), count: countPerMonth(v.count) }));

  return {
    accounts: inScope.map((s) => ({ ...s.account, sharePct: s.sharePct })),
    range: { start, end, hasData: txs.length > 0 },
    /** Months with data, newest first (`yyyy-MM`), for the single-month picker. */
    availableMonths: txs.length ? monthsBetween(first, latest).reverse() : [],
    /** `months`: months with data in the range (the divisor); `active`: flows below are per-month averages. */
    average: { months: averageMonths, available: averageAvailable, active: averaged },
    kpis: {
      ...perMonthSummary(current),
      netWorth: netWorthNow,
      netWorthChange: netWorthNow !== null && netWorthStart !== null ? perMonth(netWorthNow - netWorthStart) : null,
    },
    previous,
    months,
    cashFlowAverage,
    cashFlowGranularity,
    netWorth,
    accountSeries,
    categoryRanking,
    topMerchants,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

/* ─────────────────────────────────── Statements ─────────────────────────────────── */

/** Statements for the Import page: those needing attention (see `needsAttention`), or the ones covering a month. */
export async function listStatements(
  db: Db,
  householdId: string,
  userId: string,
  visibleIds: string[],
  filter: { attention: true } | { month: string },
  limit = 200,
) {
  const scope =
    "month" in filter
      ? and(lte(statements.periodStart, monthBounds(filter.month).end), gte(statements.periodEnd, monthBounds(filter.month).start))
      : or(sql`${statements.status} <> 'confirmed'`, isNull(statements.accountId), isNull(statements.periodStart), isNull(statements.periodEnd));
  return db
    .select({
      statement: statements,
      accountName: accounts.name,
      ibanLast4: accounts.ibanLast4,
      bankId: banks.id,
      bankName: banks.name,
      bankColor: banks.color,
    })
    .from(statements)
    .leftJoin(accounts, eq(accounts.id, statements.accountId))
    .leftJoin(banks, eq(banks.id, accounts.bankId))
    .where(
      and(
        eq(statements.householdId, householdId),
        or(
          visibleIds.length ? inArray(statements.accountId, visibleIds) : sql`false`,
          and(isNull(statements.accountId), eq(statements.uploadedBy, userId)),
        ),
        scope,
      ),
    )
    .orderBy(desc(statements.createdAt))
    .limit(limit);
}

export type CompletenessCell = { month: string; status: "confirmed" | "needs_review" | "processing" | "failed" | "missing" | "none"; statementId?: string };

/** Accounts × months grid showing which statements are imported — gaps are surfaced as issues. */
export async function getCompleteness(db: Db, householdId: string, visible: VisibleAccount[], monthsBack = 12) {
  const ids = visible.map((a) => a.id);
  const rows = ids.length
    ? await db
        .select({ id: statements.id, accountId: statements.accountId, status: statements.status, periodStart: statements.periodStart, periodEnd: statements.periodEnd })
        .from(statements)
        .where(and(eq(statements.householdId, householdId), inArray(statements.accountId, ids)))
    : [];
  const latestEnd = rows.reduce<string | null>((max, r) => (r.periodEnd && (!max || r.periodEnd > max) ? r.periodEnd : max), null);
  const anchor = latestEnd ? parseISO(latestEnd) : subMonths(new Date(), 1);
  const months = Array.from({ length: monthsBack }, (_, i) => format(subMonths(startOfMonth(anchor), monthsBack - 1 - i), "yyyy-MM"));
  const rank = { confirmed: 4, needs_review: 3, processing: 2, uploaded: 2, needs_account: 1, failed: 1 } as const;

  let gaps = 0;
  const grid = visible.map((account) => {
    const own = rows.filter((r) => r.accountId === account.id && r.periodStart && r.periodEnd);
    const covered = (month: string) =>
      own.filter((r) => monthKey(r.periodStart!) <= month && monthKey(r.periodEnd!) >= month).sort((a, b) => rank[b.status] - rank[a.status])[0];
    const firstMonth = own.map((r) => monthKey(r.periodStart!)).sort()[0];
    const cells: CompletenessCell[] = months.map((month) => {
      const hit = covered(month);
      if (hit) {
        const status = hit.status === "uploaded" ? "processing" : hit.status === "needs_account" ? "failed" : hit.status;
        return { month, status, statementId: hit.id };
      }
      if (firstMonth && month >= firstMonth) {
        gaps++;
        return { month, status: "missing" };
      }
      return { month, status: "none" };
    });
    return { account, cells, firstMonth: firstMonth ?? null };
  });
  return { months, grid, gaps };
}

/* ─────────────────────────────────── Transactions ─────────────────────────────────── */

export type TransactionFilters = {
  q?: string;
  accountId?: string;
  categoryId?: string; // uuid | "none"
  from?: string;
  to?: string;
  flagged?: boolean;
  statementId?: string;
  /** Show only removed transactions instead of hiding them. */
  excluded?: boolean;
  page?: number;
  pageSize?: number;
  /** Keyset pagination: only rows after this one in list order (replaces `page`). */
  after?: TransactionCursor;
};

export const PAGE_SIZE = DEFAULT_PAGE_SIZE;

/** Position of a row in transaction list order (newest first), as used by `after`. */
export type TransactionCursor = { bookedAt: string; position: number; id: string };

export const encodeTransactionCursor = ({ bookedAt, position, id }: TransactionCursor) => `${bookedAt}_${position}_${id}`;

export function decodeTransactionCursor(cursor: string): TransactionCursor | null {
  const m = cursor.match(/^(\d{4}-\d{2}-\d{2})_(-?\d{1,9})_([0-9a-f-]{36})$/);
  return m ? { bookedAt: m[1]!, position: Number(m[2]), id: m[3]! } : null;
}

export async function listTransactions(db: Db, householdId: string, visibleIds: string[], filters: TransactionFilters) {
  if (visibleIds.length === 0) return { rows: [], total: 0, sumCents: 0 };
  const conditions: (SQL | undefined)[] = [eq(transactions.householdId, householdId), inArray(transactions.accountId, visibleIds)];
  if (filters.accountId) conditions.push(eq(transactions.accountId, filters.accountId));
  if (filters.categoryId === "none") conditions.push(isNull(transactions.categoryId));
  else if (filters.categoryId) conditions.push(eq(transactions.categoryId, filters.categoryId));
  if (filters.from) conditions.push(gte(transactions.bookedAt, filters.from));
  if (filters.to) conditions.push(lte(transactions.bookedAt, filters.to));
  if (filters.flagged) conditions.push(eq(transactions.flagged, true));
  if (filters.statementId) conditions.push(eq(transactions.statementId, filters.statementId));
  conditions.push(filters.excluded ? isNotNull(transactions.excludedAt) : isNull(transactions.excludedAt));
  if (filters.q) {
    const like = `%${filters.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(ilike(transactions.descriptionRaw, like), ilike(transactions.merchant, like), ilike(transactions.notes, like)));
  }
  const where = and(...conditions);
  const { after } = filters;
  const pageWhere = after
    ? and(where, sql`(${transactions.bookedAt}, ${transactions.position}, ${transactions.id}) < (${after.bookedAt}::date, ${after.position}, ${after.id}::uuid)`)
    : where;
  const page = Math.max(1, filters.page ?? 1);
  const size = Math.min(filters.pageSize ?? PAGE_SIZE, 2000);

  const [rows, [agg]] = await Promise.all([
    db
      .select({
        tx: transactions,
        accountName: accounts.name,
        ibanLast4: accounts.ibanLast4,
        bankId: banks.id,
        bankName: banks.name,
        bankColor: banks.color,
        categoryName: categories.name,
        categoryColor: categories.color,
        rule: { matchType: categoryRules.matchType, pattern: categoryRules.pattern, categoryId: categoryRules.categoryId },
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .innerJoin(banks, eq(banks.id, accounts.bankId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .leftJoin(categoryRules, eq(categoryRules.id, transactions.ruleId))
      .where(pageWhere)
      .orderBy(desc(transactions.bookedAt), desc(transactions.position), desc(transactions.id))
      .limit(size)
      .offset(after ? 0 : (page - 1) * size),
    db
      .select({ total: count(), sum: sql<string>`coalesce(sum(${transactions.amountCents}), 0)` })
      .from(transactions)
      .where(where),
  ]);
  const linked = await getLinkedTransactions(db, householdId, visibleIds, rows.map((r) => r.tx));
  return { rows: rows.map((r) => ({ ...r, linked: linked(r.tx) })), total: agg?.total ?? 0, sumCents: Number(agg?.sum ?? 0) };
}

/** The other side of a linked transfer; only its existence is revealed when its account isn't visible to the user. */
export type LinkedTransaction =
  | {
      hidden: false;
      id: string;
      accountId: string;
      account: { name: string; bankId: string; bankName: string; bankColor: string; ibanLast4: string | null };
      bookedAt: string;
      description: string;
      amountCents: number;
      currency: string;
      removed: boolean;
    }
  | { hidden: true; id: string };

async function getLinkedTransactions(db: Db, householdId: string, visibleIds: string[], txs: { id: string; transferGroupId: string | null }[]) {
  const groups = [...new Set(txs.flatMap((t) => (t.transferGroupId ? [t.transferGroupId] : [])))];
  const members = groups.length
    ? await db
        .select({
          tx: transactions,
          accountName: accounts.name,
          ibanLast4: accounts.ibanLast4,
          bankId: banks.id,
          bankName: banks.name,
          bankColor: banks.color,
        })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .innerJoin(banks, eq(banks.id, accounts.bankId))
        .where(and(eq(transactions.householdId, householdId), inArray(transactions.transferGroupId, groups)))
        .orderBy(asc(transactions.bookedAt))
    : [];
  const visible = new Set(visibleIds);
  return (tx: { id: string; transferGroupId: string | null }): LinkedTransaction[] => {
    if (!tx.transferGroupId) return [];
    const others = members.filter((m) => m.tx.transferGroupId === tx.transferGroupId && m.tx.id !== tx.id && visible.has(m.tx.accountId));
    // The other side is in an account this user can't see (Row Level Security hides its row too): say only that it exists.
    if (others.length === 0) return [{ hidden: true, id: `hidden:${tx.transferGroupId}` }];
    return others.map((m) => ({
      hidden: false,
      id: m.tx.id,
      accountId: m.tx.accountId,
      account: { name: m.accountName, bankId: m.bankId, bankName: m.bankName, bankColor: m.bankColor, ibanLast4: m.ibanLast4 },
      bookedAt: m.tx.bookedAt,
      description: m.tx.merchant || m.tx.descriptionRaw,
      amountCents: m.tx.amountCents,
      currency: m.tx.currency,
      removed: m.tx.excludedAt !== null,
    }));
  };
}

export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>["rows"][number];

/* ───────────────────────────────────── Issues ───────────────────────────────────── */

export const transferSuggestionKey = (outgoingId: string, incomingId: string) => `transfer:${outgoingId}:${incomingId}`;
export const merchantSuggestionKey = (merchant: string) => `merchant:${merchant}`;

/** Everything that needs a human: Summ-style "issues" inbox. */
export async function getIssues(db: Db, householdId: string, userId: string) {
  const visible = await getVisibleAccounts(db, householdId, userId);
  const ids = visible.map((a) => a.id);
  const accountRef = new Map(
    visible.map((a) => [a.id, { name: a.name, bankId: a.bankId, bankName: a.bankName, bankColor: a.bankColor, ibanLast4: a.ibanLast4 }]),
  );

  // Statements of archived accounts still need review, so they must not vanish from the inbox.
  const withArchived = await getVisibleAccounts(db, householdId, userId, { includeArchived: true });
  const statementRows = await listStatements(db, householdId, userId, withArchived.map((a) => a.id), { attention: true });
  const needsAccount = statementRows.filter((s) => s.statement.status === "needs_account");
  const failed = statementRows.filter((s) => s.statement.status === "failed");
  const toReview = statementRows.filter((s) => s.statement.status === "needs_review");

  const dismissed = new Set(
    (await db.select({ key: dismissedSuggestions.key }).from(dismissedSuggestions).where(eq(dismissedSuggestions.householdId, householdId))).map(
      (d) => d.key,
    ),
  );

  const flagged = ids.length
    ? await db
        .select({
          tx: transactions,
          accountName: accounts.name,
          ibanLast4: accounts.ibanLast4,
          bankId: banks.id,
          bankName: banks.name,
          bankColor: banks.color,
          categoryName: categories.name,
        })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .innerJoin(banks, eq(banks.id, accounts.bankId))
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(and(eq(transactions.householdId, householdId), inArray(transactions.accountId, ids), eq(transactions.flagged, true), isNull(transactions.excludedAt)))
        .orderBy(desc(transactions.bookedAt))
    : [];

  // Group flagged rows by merchant so one decision fixes many rows (plus a rule for the future).
  const groups = new Map<string, typeof flagged>();
  for (const row of flagged) {
    const key = row.tx.merchant || row.tx.descriptionRaw;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const merchantGroups = [...groups.entries()]
    .map(([merchant, rows]) => ({ merchant, rows, totalCents: rows.reduce((s, r) => s + r.tx.amountCents, 0) }))
    .filter((g) => !dismissed.has(merchantSuggestionKey(g.merchant)))
    .sort((a, b) => b.rows.length - a.rows.length || a.totalCents - b.totalCents);

  const transfers = ids.length
    ? (await findTransferSuggestions(db, householdId, ids))
        .filter((s) => !dismissed.has(transferSuggestionKey(s.outgoing.id, s.incoming.id)))
        .flatMap((s) => {
          const outgoingAccount = accountRef.get(s.outgoing.accountId);
          const incomingAccount = accountRef.get(s.incoming.accountId);
          return outgoingAccount && incomingAccount ? [{ ...s, outgoingAccount, incomingAccount }] : [];
        })
    : [];

  const completeness = await getCompleteness(db, householdId, visible);

  return {
    needsAccount,
    failed,
    toReview,
    merchantGroups,
    flaggedCount: flagged.length,
    transfers,
    gaps: completeness.gaps,
    total: needsAccount.length + failed.length + toReview.length + merchantGroups.length + transfers.length + completeness.gaps,
  };
}
