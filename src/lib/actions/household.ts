"use server";

import { UserError } from "@/lib/errors";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, type Db } from "@/lib/db";
import { accounts, categories, households } from "@/lib/db/schema";
import { acceptInvite, createAccount, createHousehold, createInvite, updateAccount, type AccountInput } from "@/lib/households";
import { deleteCategory, updateCategory } from "@/lib/categories";
import { localizeCategoryName } from "@/lib/i18n/categories";
import { getVisibleAccounts } from "@/lib/queries";
import { requireContext, requireUser } from "@/lib/server/auth";
import { fail, ok, type ActionResult } from "./result";

export async function createHouseholdAction(_: unknown, formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  try {
    await createHousehold(await getDb(), user.id, name);
  } catch (error) {
    return fail(error);
  }
  redirect("/accounts");
}

export async function acceptInviteAction(token: string) {
  const user = await requireUser();
  try {
    await acceptInvite(await getDb(), token, user);
  } catch (error) {
    return fail(error);
  }
  redirect("/dashboard");
}

export async function inviteMemberAction(email: string): Promise<ActionResult<{ url: string }>> {
  try {
    const { db, user, household, role } = await requireContext();
    if (role !== "owner") throw new UserError("owner_only");
    const address = z.string().trim().email("invalid_email").parse(email);
    const invite = await createInvite(db, household.id, user.id, address);
    revalidatePath("/settings", "layout");
    // Mocked email delivery: the link is shown in the UI to copy & share.
    return ok({ url: `/invite/${invite.token}` });
  } catch (error) {
    return fail(error);
  }
}

export async function renameHouseholdAction(name: string): Promise<ActionResult> {
  try {
    const { db, household } = await requireContext();
    const value = z.string().trim().min(1).max(80).parse(name);
    await db.update(households).set({ name: value }).where(eq(households.id, household.id));
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

/** Members may only change accounts they can see: a partner's private account is off-limits even by id. */
async function assertAccountVisible(db: Db, householdId: string, userId: string, accountId: string) {
  const visible = await getVisibleAccounts(db, householdId, userId, { includeArchived: true });
  if (!visible.some((a) => a.id === accountId)) throw new UserError("account_not_found");
}

export async function saveAccountAction(input: AccountInput, accountId?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, household, user } = await requireContext();
    if (accountId) await assertAccountVisible(db, household.id, user.id, accountId);
    const account = accountId ? await updateAccount(db, household.id, accountId, input) : await createAccount(db, household.id, input);
    revalidatePath("/", "layout");
    return ok({ id: account.id });
  } catch (error) {
    if (error instanceof Error && /accounts_iban_hash_idx|duplicate key/.test(error.message)) {
      return fail(new UserError("iban_exists"));
    }
    return fail(error);
  }
}

export async function archiveAccountAction(accountId: string, archived: boolean): Promise<ActionResult> {
  try {
    const { db, household, user } = await requireContext();
    await assertAccountVisible(db, household.id, user.id, accountId);
    await db
      .update(accounts)
      .set({ archivedAt: archived ? new Date() : null })
      .where(and(eq(accounts.id, accountId), eq(accounts.householdId, household.id)));
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  kind: z.enum(["expense", "income", "transfer"]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#64748b"),
  icon: z.string().regex(/^[a-z0-9-]{1,60}$/).default("tag"),
});

export async function createCategoryAction(input: z.input<typeof categorySchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, household } = await requireContext();
    const data = categorySchema.parse(input);
    const slug = `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "category"}-${Date.now().toString(36)}`;
    const [row] = await db.insert(categories).values({ householdId: household.id, slug, ...data }).returning({ id: categories.id });
    revalidatePath("/", "layout");
    return ok({ id: row!.id });
  } catch (error) {
    return fail(error);
  }
}

export async function updateCategoryAction(categoryId: string, input: z.input<typeof categorySchema>): Promise<ActionResult> {
  try {
    const { db, household } = await requireContext();
    const id = z.string().uuid().parse(categoryId);
    const data = categorySchema.parse(input);
    const [current] = await db
      .select({ slug: categories.slug, name: categories.name })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.householdId, household.id)));
    // Saving a built-in category with its translated name must not freeze that translation as a rename.
    const name = current && data.name === localizeCategoryName(current, await getLocale()) ? current.name : data.name;
    await updateCategory(db, household.id, id, { ...data, name });
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCategoryAction(categoryId: string, targetId: string | null): Promise<ActionResult<{ moved: number }>> {
  try {
    const { db, household, user } = await requireContext();
    const uuid = z.string().uuid();
    const result = await deleteCategory(db, household.id, user.id, uuid.parse(categoryId), targetId ? uuid.parse(targetId) : null);
    revalidatePath("/", "layout");
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
