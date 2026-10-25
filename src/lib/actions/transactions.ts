"use server";

import { UserError } from "@/lib/errors";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categories, categoryRules, dismissedSuggestions, transactionChanges, transactions } from "@/lib/db/schema";
import { isValidRegex } from "@/lib/domain/rules";
import { applyRuleRetroactively, linkTransfer, previewRule, unlinkTransfer } from "@/lib/pipeline/categorize";
import { getVisibleAccounts } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { fail, ok, type ActionResult } from "./result";

const uuid = z.string().uuid();

/** Loads transactions the current user is allowed to touch. */
async function loadTransactions(ids: string[]) {
  const ctx = await requireContext();
  const parsed = z.array(uuid).min(1).max(1000).parse(ids);
  const visible = new Set((await getVisibleAccounts(ctx.db, ctx.household.id, ctx.user.id)).map((a) => a.id));
  const rows = await ctx.db
    .select()
    .from(transactions)
    .where(and(eq(transactions.householdId, ctx.household.id), inArray(transactions.id, parsed)));
  const allowed = rows.filter((r) => visible.has(r.accountId));
  if (allowed.length !== parsed.length) throw new UserError("transactions_not_found");
  return { ...ctx, rows: allowed };
}

async function assertCategory(db: Awaited<ReturnType<typeof requireContext>>["db"], householdId: string, categoryId: string | null) {
  if (!categoryId) return null;
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, uuid.parse(categoryId)), eq(categories.householdId, householdId)));
  if (!category) throw new UserError("category_not_found");
  return category;
}

export async function setCategoryAction(ids: string[], categoryId: string | null): Promise<ActionResult<{ updated: number }>> {
  try {
    const { db, household, user, rows } = await loadTransactions(ids);
    const category = await assertCategory(db, household.id, categoryId);

    // Recategorizing one side of a linked transfer breaks the link.
    for (const groupId of new Set(rows.map((r) => r.transferGroupId).filter((g): g is string => !!g))) {
      if (category?.kind !== "transfer") await unlinkTransfer(db, household.id, groupId);
    }
    const changed = rows.filter((r) => r.categoryId !== categoryId || r.categorizedBy !== "user" || r.flagged);
    if (changed.length === 0) return ok({ updated: 0 });
    await db
      .update(transactions)
      .set({ categoryId, categorizedBy: "user", categoryConfidence: 1, flagged: false, flagReason: null })
      .where(inArray(transactions.id, changed.map((r) => r.id)));
    await db.insert(transactionChanges).values(
      changed.map((r) => ({ transactionId: r.id, userId: user.id, field: "category", oldValue: r.categoryId, newValue: categoryId })),
    );
    revalidatePath("/", "layout");
    return ok({ updated: changed.length });
  } catch (error) {
    return fail(error);
  }
}

export async function setNotesAction(id: string, notes: string): Promise<ActionResult> {
  try {
    const { db, user, rows } = await loadTransactions([id]);
    const value = z.string().max(500).parse(notes).trim() || null;
    if (rows[0]!.notes === value) return ok();
    await db.update(transactions).set({ notes: value }).where(eq(transactions.id, id));
    await db.insert(transactionChanges).values({ transactionId: id, userId: user.id, field: "notes", oldValue: rows[0]!.notes, newValue: value });
    revalidatePath("/transactions");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function getTransactionHistoryAction(id: string) {
  const { db } = await loadTransactions([id]);
  return db.select().from(transactionChanges).where(eq(transactionChanges.transactionId, id)).orderBy(transactionChanges.createdAt);
}

const ruleSchema = z
  .object({
    matchType: z.enum(["contains", "regex", "merchant"]),
    pattern: z.string().trim().min(2, "Pattern is too short").max(120),
    categoryId: uuid,
  })
  .refine((r) => r.matchType !== "regex" || isValidRegex(r.pattern), { message: "invalid_regex", path: ["pattern"] });

export type RuleInput = z.input<typeof ruleSchema>;

export async function previewRuleAction(input: RuleInput): Promise<ActionResult<{ count: number; examples: string[] }>> {
  try {
    const { db, household } = await requireContext();
    const rule = ruleSchema.parse(input);
    await assertCategory(db, household.id, rule.categoryId);
    const matches = await previewRule(db, household.id, rule);
    return ok({ count: matches.length, examples: [...new Set(matches.map((m) => m.descriptionRaw))].slice(0, 5) });
  } catch (error) {
    return fail(error);
  }
}

export async function createRuleAction(input: RuleInput, applyToExisting: boolean): Promise<ActionResult<{ applied: number }>> {
  try {
    const { db, household, user } = await requireContext();
    const rule = ruleSchema.parse(input);
    await assertCategory(db, household.id, rule.categoryId);
    const [row] = await db
      .insert(categoryRules)
      .values({ householdId: household.id, createdBy: user.id, priority: rule.matchType === "merchant" ? 50 : 100, ...rule })
      .returning();
    const applied = applyToExisting ? await applyRuleRetroactively(db, household.id, row!.id) : 0;
    revalidatePath("/", "layout");
    return ok({ applied });
  } catch (error) {
    return fail(error);
  }
}

export async function deleteRuleAction(ruleId: string): Promise<ActionResult> {
  try {
    const { db, household } = await requireContext();
    await db.delete(categoryRules).where(and(eq(categoryRules.id, uuid.parse(ruleId)), eq(categoryRules.householdId, household.id)));
    revalidatePath("/settings");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

/** One decision for a whole merchant group from the issues inbox, optionally remembered as a rule. */
export async function categorizeMerchantAction(ids: string[], merchant: string, categoryId: string, remember: boolean) {
  const result = await setCategoryAction(ids, categoryId);
  if (!result.ok || !remember || !merchant) return result;
  const rule = await createRuleAction({ matchType: "merchant", pattern: merchant, categoryId }, true);
  return rule.ok ? result : rule;
}

export async function linkTransferAction(outgoingId: string, incomingId: string): Promise<ActionResult> {
  try {
    const { db, household, rows } = await loadTransactions([outgoingId, incomingId]);
    const [a, b] = [rows.find((r) => r.id === outgoingId)!, rows.find((r) => r.id === incomingId)!];
    if (a.accountId === b.accountId || a.amountCents !== -b.amountCents) throw new UserError("not_mirror_transfer");
    await linkTransfer(db, household.id, outgoingId, incomingId);
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function unlinkTransferAction(transactionId: string): Promise<ActionResult> {
  try {
    const { db, household, rows } = await loadTransactions([transactionId]);
    if (rows[0]!.transferGroupId) await unlinkTransfer(db, household.id, rows[0]!.transferGroupId);
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function dismissSuggestionAction(key: string): Promise<ActionResult> {
  try {
    const { db, household } = await requireContext();
    await db
      .insert(dismissedSuggestions)
      .values({ householdId: household.id, key: z.string().min(1).max(300).parse(key) })
      .onConflictDoNothing();
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return fail(error);
  }
}
