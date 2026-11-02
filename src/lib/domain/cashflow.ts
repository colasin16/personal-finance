export type Flow = { amount: number; categoryId: string | null };
export type CategoryNet = { spent: number; reimbursed: number; cents: number; count: number };

/**
 * Income/expense totals where money coming back into an expense category (a friend paying their half of
 * a dinner) reimburses that category instead of counting as income. Netting is per category within the given
 * flows; a category reimbursed beyond what was spent contributes 0 to expenses and the excess to income, so
 * `income - expenses` always equals the plain sum of the amounts.
 */
export function netCashFlow(flows: Iterable<Flow>, isExpenseCategory: (categoryId: string) => boolean) {
  const byCategory = new Map<string | null, CategoryNet>();
  let income = 0;
  for (const { amount, categoryId } of flows) {
    const reimbursement = amount > 0 && categoryId !== null && isExpenseCategory(categoryId);
    if (amount > 0 && !reimbursement) {
      income += amount;
      continue;
    }
    if (amount === 0) continue;
    const c = byCategory.get(categoryId) ?? { spent: 0, reimbursed: 0, cents: 0, count: 0 };
    if (amount < 0) c.spent += -amount;
    else c.reimbursed += amount;
    c.count++;
    byCategory.set(categoryId, c);
  }
  let expenses = 0;
  for (const c of byCategory.values()) {
    const net = c.spent - c.reimbursed;
    c.cents = Math.max(0, net);
    expenses += c.cents;
    income += Math.max(0, -net);
  }
  return { income, expenses, byCategory };
}
