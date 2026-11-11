import { fn } from "storybook/test";
import type * as real from "@/lib/actions/budgets";

const done = { ok: true as const, data: undefined };

export const setBudgetAction = fn<typeof real.setBudgetAction>(async () => done).mockName("setBudgetAction");
export const setBudgetsAction = fn<typeof real.setBudgetsAction>(async () => done).mockName("setBudgetsAction");
