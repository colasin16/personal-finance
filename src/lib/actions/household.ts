"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { accounts, categories, households } from "@/lib/db/schema";
import { acceptInvite, createAccount, createHousehold, createInvite, updateAccount, type AccountInput } from "@/lib/households";
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
    await acceptInvite(await getDb(), token, user.id);
  } catch (error) {
    return fail(error);
  }
  redirect("/dashboard");
}

export async function inviteMemberAction(email: string): Promise<ActionResult<{ url: string }>> {
  try {
    const { db, user, household } = await requireContext();
    const address = z.string().trim().email("Enter a valid email address").parse(email);
    const invite = await createInvite(db, household.id, user.id, address);
    revalidatePath("/settings");
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

export async function saveAccountAction(input: AccountInput, accountId?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, household } = await requireContext();
    const account = accountId ? await updateAccount(db, household.id, accountId, input) : await createAccount(db, household.id, input);
    revalidatePath("/", "layout");
    return ok({ id: account.id });
  } catch (error) {
    if (error instanceof Error && /accounts_iban_hash_idx|duplicate key/.test(error.message)) {
      return { ok: false, error: "An account with this IBAN already exists." };
    }
    return fail(error);
  }
}

export async function archiveAccountAction(accountId: string, archived: boolean): Promise<ActionResult> {
  try {
    const { db, household } = await requireContext();
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
