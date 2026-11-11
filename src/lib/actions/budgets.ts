"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setBudgets } from "@/lib/budgets";
import { requireContext } from "@/lib/server/auth";
import { isMonthParam } from "@/lib/statement-months";
import { fail, ok, type ActionResult } from "./result";

const month = z.string().refine(isMonthParam, "invalid_input");
// Up to €10M, in whole cents.
const change = z.object({ categoryId: z.string().uuid(), amountCents: z.number().int().min(0).max(1_000_000_000) });

/** Sets one category's budget for `month`; `applyForward` also replaces the following months. 0 removes it. */
export async function setBudgetAction(input: { month: string; categoryId: string; amountCents: number; applyForward: boolean }): Promise<ActionResult> {
  try {
    const { db, household } = await requireContext();
    const data = change.extend({ month, applyForward: z.boolean() }).parse(input);
    await setBudgets(db, household.id, data.month, [data], data.applyForward);
    revalidatePath("/budgets");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

/** Sets several budgets from `month` onwards (e.g. the suggested starting budgets). */
export async function setBudgetsAction(input: { month: string; changes: { categoryId: string; amountCents: number }[] }): Promise<ActionResult> {
  try {
    const { db, household } = await requireContext();
    const data = z.object({ month, changes: z.array(change).max(200) }).parse(input);
    await setBudgets(db, household.id, data.month, data.changes, true);
    revalidatePath("/budgets");
    return ok();
  } catch (error) {
    return fail(error);
  }
}
