import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { categories, categoryRules, transactionChanges, transactions } from "@/lib/db/schema";
import { UserError } from "@/lib/errors";

/** Linked transfers are always filed under this category, so it can't be deleted or change kind. */
export const SYSTEM_CATEGORY_SLUGS = new Set(["transfers"]);

export type CategoryUpdate = { name: string; kind: "expense" | "income" | "transfer"; icon: string; color: string };

async function loadCategory(db: Db, householdId: string, categoryId: string) {
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.householdId, householdId)));
  if (!category) throw new UserError("category_not_found");
  return category;
}

export async function updateCategory(db: Db, householdId: string, categoryId: string, data: CategoryUpdate) {
  const category = await loadCategory(db, householdId, categoryId);
  if (SYSTEM_CATEGORY_SLUGS.has(category.slug) && data.kind !== category.kind) throw new UserError("category_protected");
  await db.update(categories).set(data).where(eq(categories.id, category.id));
}

/**
 * Deletes a category, moving its transactions and rules to `targetId`. Without a target, transactions
 * become uncategorized (and flagged for review) and the category's rules are removed.
 */
export async function deleteCategory(db: Db, householdId: string, userId: string, categoryId: string, targetId: string | null) {
  const category = await loadCategory(db, householdId, categoryId);
  if (SYSTEM_CATEGORY_SLUGS.has(category.slug)) throw new UserError("category_protected");
  if (targetId === category.id) throw new UserError("category_same_target");
  if (targetId) await loadCategory(db, householdId, targetId);

  return db.transaction(async (tx) => {
    const moved = await tx
      .update(transactions)
      .set(targetId ? { categoryId: targetId } : { categoryId: null, categorizedBy: null, ruleId: null, flagged: true, flagReason: "uncategorized" })
      .where(and(eq(transactions.householdId, householdId), eq(transactions.categoryId, category.id)))
      .returning({ id: transactions.id });
    if (moved.length > 0) {
      await tx
        .insert(transactionChanges)
        .values(moved.map((m) => ({ transactionId: m.id, userId, field: "category", oldValue: category.id, newValue: targetId })));
    }
    if (targetId) await tx.update(categoryRules).set({ categoryId: targetId }).where(eq(categoryRules.categoryId, category.id));
    await tx.update(categories).set({ parentId: null }).where(eq(categories.parentId, category.id));
    await tx.delete(categories).where(eq(categories.id, category.id));
    return { moved: moved.length };
  });
}
