/**
 * Monthly category budgets. A budget row applies from its month (`yyyy-MM`) until the next row for the same
 * category, so an amount carries forward without a row per month; 0 means "no budget".
 */
export type BudgetRow = { categoryId: string; month: string; amountCents: number };

const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 7);
};

/** The amount in effect for each category in `month` (only categories with a budget above 0). */
export function effectiveBudgets(rows: BudgetRow[], month: string) {
  const latest = new Map<string, BudgetRow>();
  for (const row of rows) {
    if (row.month > month) continue;
    const current = latest.get(row.categoryId);
    if (!current || row.month > current.month) latest.set(row.categoryId, row);
  }
  const result = new Map<string, number>();
  for (const [categoryId, row] of latest) if (row.amountCents > 0) result.set(categoryId, row.amountCents);
  return result;
}

/**
 * The writes that set one category's budget for `month`. With `applyForward` the amount also replaces every later
 * month; otherwise only `month` changes and the following month keeps the amount it had.
 */
export function planBudgetChange(rows: BudgetRow[], categoryId: string, month: string, amountCents: number, applyForward: boolean) {
  const own = rows.filter((r) => r.categoryId === categoryId);
  const upserts = [{ month, amountCents }];
  if (applyForward) return { upserts, deleteAfter: month };
  const following = nextMonth(month);
  const before = effectiveBudgets(own, following).get(categoryId) ?? 0;
  if (!own.some((r) => r.month === following) && before !== amountCents) upserts.push({ month: following, amountCents: before });
  return { upserts, deleteAfter: null };
}

export type BudgetStatus = "ok" | "near" | "over";

/** Share of the budget at which a category turns amber. */
export const NEAR_LIMIT = 0.85;

export function budgetStatus(spentCents: number, budgetCents: number): BudgetStatus {
  if (spentCents > budgetCents) return "over";
  return spentCents >= budgetCents * NEAR_LIMIT ? "near" : "ok";
}

/**
 * How far through `month` we are on `today` (`yyyy-MM-dd`): the expected share of the budget spent by now, and the
 * days left including today. Null for past and future months.
 */
export function monthPace(month: string, today: string) {
  if (today.slice(0, 7) !== month) return null;
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const day = Number(today.slice(8, 10));
  return { fraction: day / days, daysLeft: days - day + 1 };
}

/** A round budget at or above `cents`: whole €5 below €100, €10 below €1,000, then €50. */
export function suggestBudget(cents: number) {
  if (cents <= 0) return 0;
  const step = cents < 10_000 ? 500 : cents < 100_000 ? 1_000 : 5_000;
  return Math.ceil(cents / step) * step;
}
