import { and, eq, gt, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { budgets, categories, transactions } from "@/lib/db/schema";
import { netCashFlow } from "@/lib/domain/cashflow";
import { effectiveBudgets, monthPace, planBudgetChange, type BudgetRow } from "@/lib/domain/budgets";
import { UserError } from "@/lib/errors";
import { getCategories, getVisibleAccounts } from "@/lib/queries";
import { monthBounds, shiftMonth } from "@/lib/statement-months";

/** Past months whose spending feeds the "average" suggestion. */
export const AVERAGE_MONTHS = 3;

const toRow = (r: { categoryId: string; month: string; amountCents: number }): BudgetRow => ({ ...r, month: r.month.slice(0, 7) });

async function loadBudgetRows(db: Db, householdId: string, categoryIds?: string[]) {
  const rows = await db
    .select({ categoryId: budgets.categoryId, month: budgets.month, amountCents: budgets.amountCents })
    .from(budgets)
    .where(and(eq(budgets.householdId, householdId), categoryIds ? inArray(budgets.categoryId, categoryIds) : undefined));
  return rows.map(toRow);
}

/**
 * Budgets and spending for `month` (`yyyy-MM`) across every account the user can see, with last month's and the
 * average of the previous months' spending for suggestions. Spending is net of reimbursements and skips transfers,
 * like the dashboard. `today` (`yyyy-MM-dd`) drives the pace of the current month.
 */
export async function getBudgetMonth(db: Db, householdId: string, userId: string, month: string, today: string, locale = "en") {
  const [visible, cats, rows] = await Promise.all([getVisibleAccounts(db, householdId, userId), getCategories(db, householdId, locale), loadBudgetRows(db, householdId)]);
  const catBy = new Map(cats.map((c) => [c.id, c]));
  const from = monthBounds(shiftMonth(month, -AVERAGE_MONTHS)).start;
  const to = monthBounds(month).end;
  const txs = visible.length
    ? await db
        .select({
          bookedAt: transactions.bookedAt,
          amountCents: transactions.amountCents,
          categoryId: transactions.categoryId,
          transferGroupId: transactions.transferGroupId,
        })
        .from(transactions)
        .where(
          and(
            inArray(
              transactions.accountId,
              visible.map((a) => a.id),
            ),
            isNull(transactions.excludedAt),
            gte(transactions.bookedAt, from),
            lte(transactions.bookedAt, to),
          ),
        )
    : [];

  const isTransfer = (tx: (typeof txs)[number]) => tx.transferGroupId !== null || (tx.categoryId !== null && catBy.get(tx.categoryId)?.kind === "transfer");
  const isExpenseCategory = (categoryId: string) => catBy.get(categoryId)?.kind === "expense";
  const flowsIn = (m: string) =>
    netCashFlow(
      txs.filter((tx) => tx.bookedAt.startsWith(m) && !isTransfer(tx)).map((tx) => ({ amount: tx.amountCents, categoryId: tx.categoryId })),
      isExpenseCategory,
    );
  const hasData = (m: string) => txs.some((tx) => tx.bookedAt.startsWith(m));

  const current = flowsIn(month);
  const lastMonth = shiftMonth(month, -1);
  const last = flowsIn(lastMonth);
  // Only months with imported data count, so a gap doesn't drag the average down.
  const pastMonths = Array.from({ length: AVERAGE_MONTHS }, (_, i) => shiftMonth(month, -1 - i)).filter(hasData);
  const past = pastMonths.map(flowsIn);

  const budgetNow = effectiveBudgets(rows, month);
  const budgetLast = effectiveBudgets(rows, lastMonth);

  const expenseCategories = cats
    .filter((c) => c.kind === "expense")
    .map((c) => {
      const spending = current.byCategory.get(c.id);
      const pastTotal = past.reduce((sum, p) => sum + (p.byCategory.get(c.id)?.cents ?? 0), 0);
      return {
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        budget: budgetNow.get(c.id) ?? 0,
        spent: spending?.cents ?? 0,
        reimbursed: spending?.reimbursed ?? 0,
        count: spending?.count ?? 0,
        lastMonthBudget: budgetLast.get(c.id) ?? 0,
        lastMonthSpent: last.byCategory.get(c.id)?.cents ?? 0,
        averageSpent: pastMonths.length ? Math.round(pastTotal / pastMonths.length) : null,
      };
    });

  const uncategorized = current.byCategory.get(null);
  const categorized = expenseCategories.reduce((sum, c) => sum + c.spent, 0) + (uncategorized?.cents ?? 0);
  return {
    month,
    pace: monthPace(month, today),
    hasTransactions: hasData(month),
    averageMonths: pastMonths.length,
    income: current.income,
    expenses: current.expenses,
    categories: expenseCategories,
    uncategorized: { cents: uncategorized?.cents ?? 0, count: uncategorized?.count ?? 0 },
    /** Spending filed under income categories (e.g. a refund of salary); outside any budget. */
    otherSpending: Math.max(0, current.expenses - categorized),
  };
}

export type BudgetMonth = Awaited<ReturnType<typeof getBudgetMonth>>;

async function assertBudgetable(db: Db, householdId: string, categoryIds: string[]) {
  const found = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.householdId, householdId), eq(categories.kind, "expense"), inArray(categories.id, categoryIds)));
  if (found.length !== new Set(categoryIds).size) throw new UserError("category_not_budgetable");
}

export type BudgetChange = { categoryId: string; amountCents: number };

/**
 * Sets budgets for `month`. With `applyForward` each amount also replaces the following months; otherwise later
 * months keep what they had.
 */
export async function setBudgets(db: Db, householdId: string, month: string, changes: BudgetChange[], applyForward: boolean) {
  if (changes.length === 0) return;
  const ids = changes.map((c) => c.categoryId);
  await assertBudgetable(db, householdId, ids);
  const rows = await loadBudgetRows(db, householdId, ids);
  await db.transaction(async (tx) => {
    for (const { categoryId, amountCents } of changes) {
      const plan = planBudgetChange(rows, categoryId, month, amountCents, applyForward);
      await tx
        .insert(budgets)
        .values(plan.upserts.map((u) => ({ householdId, categoryId, month: `${u.month}-01`, amountCents: u.amountCents })))
        .onConflictDoUpdate({
          target: [budgets.categoryId, budgets.month],
          set: { amountCents: sql`excluded.amount_cents`, updatedAt: sql`now()` },
        });
      if (plan.deleteAfter) await tx.delete(budgets).where(and(eq(budgets.categoryId, categoryId), gt(budgets.month, `${plan.deleteAfter}-01`)));
    }
  });
}
