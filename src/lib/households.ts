import { UserError } from "@/lib/errors";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { accountOwners, accounts, householdInvites, householdMembers, households, users } from "@/lib/db/schema";
import { seedHouseholdCategories } from "@/lib/db/seed";
import { compactIban } from "@/lib/domain/redact";
import { ibanHash } from "@/lib/pipeline/process-statement";

export async function findOrCreateUser(db: Db, email: string, displayName?: string) {
  const normalized = email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({ email: normalized, displayName: displayName?.trim() || normalized.split("@")[0]! })
    .returning();
  return created!;
}

export async function getMembership(db: Db, userId: string) {
  const [row] = await db
    .select({ household: households, role: householdMembers.role })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId));
  return row ?? null;
}

export async function getMembers(db: Db, householdId: string) {
  return db
    .select({ id: users.id, email: users.email, displayName: users.displayName, role: householdMembers.role })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(householdMembers.joinedAt);
}

export async function createHousehold(db: Db, userId: string, name: string, baseCurrency = "EUR") {
  if (await getMembership(db, userId)) throw new UserError("already_in_household");
  const [household] = await db.insert(households).values({ name: name.trim() || "Our household", baseCurrency }).returning();
  await db.insert(householdMembers).values({ householdId: household!.id, userId, role: "owner" });
  await seedHouseholdCategories(db, household!.id);
  return household!;
}

export async function createInvite(db: Db, householdId: string, invitedBy: string, email: string) {
  const token = randomBytes(24).toString("base64url");
  const [invite] = await db
    .insert(householdInvites)
    .values({
      householdId,
      invitedBy,
      email: email.trim().toLowerCase(),
      token,
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
    })
    .returning();
  return invite!;
}

export async function getInvite(db: Db, token: string) {
  const [row] = await db
    .select({ invite: householdInvites, householdName: households.name })
    .from(householdInvites)
    .innerJoin(households, eq(households.id, householdInvites.householdId))
    .where(and(eq(householdInvites.token, token), isNull(householdInvites.acceptedAt), gt(householdInvites.expiresAt, new Date())));
  return row ?? null;
}

export async function pendingInvitesFor(db: Db, email: string) {
  return db
    .select({ token: householdInvites.token, householdName: households.name })
    .from(householdInvites)
    .innerJoin(households, eq(households.id, householdInvites.householdId))
    .where(
      and(eq(householdInvites.email, email.toLowerCase()), isNull(householdInvites.acceptedAt), gt(householdInvites.expiresAt, new Date())),
    );
}

export async function acceptInvite(db: Db, token: string, userId: string) {
  const row = await getInvite(db, token);
  if (!row) throw new UserError("invite_invalid");
  if (await getMembership(db, userId)) throw new UserError("already_in_household");
  await db.insert(householdMembers).values({ householdId: row.invite.householdId, userId, role: "member" });
  await db.update(householdInvites).set({ acceptedAt: new Date() }).where(eq(householdInvites.id, row.invite.id));
  return row.invite.householdId;
}

export const accountInputSchema = z
  .object({
    bankId: z.string().min(1),
    name: z.string().trim().min(1, "Give the account a name").max(80),
    iban: z
      .string()
      .trim()
      .transform((v) => compactIban(v))
      .refine((v) => v === "" || /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v), "That doesn't look like a valid IBAN")
      .optional(),
    currency: z.string().length(3).default("EUR"),
    type: z.enum(["checking", "savings", "credit", "investment"]).default("checking"),
    isPrivate: z.boolean().default(false),
    owners: z.array(z.object({ userId: z.string().uuid(), sharePct: z.number().min(0).max(100) })).min(1, "Pick at least one owner"),
  })
  .refine((v) => Math.abs(v.owners.reduce((s, o) => s + o.sharePct, 0) - 100) < 0.01, {
    message: "shares_must_total_100",
    path: ["owners"],
  });

export type AccountInput = z.input<typeof accountInputSchema>;

async function assertOwnersAreMembers(db: Db, householdId: string, owners: { userId: string }[]) {
  const members = new Set((await getMembers(db, householdId)).map((m) => m.id));
  if (owners.some((o) => !members.has(o.userId))) throw new UserError("owners_not_members");
}

export async function createAccount(db: Db, householdId: string, input: AccountInput) {
  const data = accountInputSchema.parse(input);
  await assertOwnersAreMembers(db, householdId, data.owners);
  const [account] = await db
    .insert(accounts)
    .values({
      householdId,
      bankId: data.bankId,
      name: data.name,
      ibanLast4: data.iban ? data.iban.slice(-4) : null,
      ibanHash: data.iban ? ibanHash(householdId, data.iban) : null,
      currency: data.currency,
      type: data.type,
      isPrivate: data.isPrivate,
    })
    .returning();
  await db.insert(accountOwners).values(data.owners.map((o) => ({ accountId: account!.id, ...o })));
  return account!;
}

export async function updateAccount(db: Db, householdId: string, accountId: string, input: AccountInput) {
  const data = accountInputSchema.parse(input);
  await assertOwnersAreMembers(db, householdId, data.owners);
  const [account] = await db
    .update(accounts)
    .set({
      bankId: data.bankId,
      name: data.name,
      currency: data.currency,
      type: data.type,
      isPrivate: data.isPrivate,
      ...(data.iban ? { ibanLast4: data.iban.slice(-4), ibanHash: ibanHash(householdId, data.iban) } : {}),
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)))
    .returning();
  if (!account) throw new UserError("account_not_found");
  await db.delete(accountOwners).where(eq(accountOwners.accountId, accountId));
  await db.insert(accountOwners).values(data.owners.map((o) => ({ accountId, ...o })));
  return account;
}
