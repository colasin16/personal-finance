"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import {
  BANK_CONNECTIONS_PATH,
  canSyncNow,
  configureBankAccounts,
  disconnectBank,
  listProviderBanks,
  startBankConnection,
  syncConnection,
} from "@/lib/bank-sync";
import { bankConnections, banks } from "@/lib/db/schema";
import { matchBankId } from "@/lib/domain/bank-sync";
import { getSystemDb } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { requireContext } from "@/lib/server/auth";
import { appOrigin } from "@/lib/server/origin";
import { and, eq } from "drizzle-orm";
import { fail, ok, type ActionResult } from "./result";

const SYNCED_PATHS = ["/budgets", "/dashboard", "/transactions", "/issues", "/accounts", BANK_CONNECTIONS_PATH];
const revalidateSynced = () => SYNCED_PATHS.forEach((p) => revalidatePath(p));

export type ProviderBankOption = { name: string; country: string; beta: boolean; bankId: string; color: string };

/** Banks the user can connect (Spain), for the connect dialog. */
export async function listBanksAction(): Promise<ActionResult<ProviderBankOption[]>> {
  try {
    const { db } = await requireContext();
    const [list, ours] = await Promise.all([listProviderBanks("ES"), db.select().from(banks)]);
    return ok(
      list.map(({ name, country, beta }) => {
        const bankId = matchBankId(name, ours);
        return { name, country, beta, bankId, color: ours.find((b) => b.id === bankId)?.color ?? "#64748b" };
      }),
    );
  } catch (error) {
    return fail(error instanceof UserError ? error : new UserError("bank_unavailable"));
  }
}

/** Starts the bank's consent flow (new connection, or a reconnect of `connectionId`) and returns where to send the user. */
export async function connectBankAction(input: { bankName?: string; bankCountry?: string; connectionId?: string }): Promise<ActionResult<{ url: string }>> {
  try {
    const { db, user, household } = await requireContext();
    const data = z
      .object({ bankName: z.string().max(200).default(""), bankCountry: z.string().length(2).default("ES"), connectionId: z.string().uuid().optional() })
      .parse(input);
    const { url } = await startBankConnection(db, { householdId: household.id, userId: user.id, origin: await appOrigin(), language: await getLocale() }, data);
    return ok({ url });
  } catch (error) {
    return fail(error instanceof UserError || error instanceof z.ZodError ? error : new UserError("bank_unavailable"));
  }
}

const choice = z.object({
  linkId: z.string().uuid(),
  accountId: z.union([z.string().uuid(), z.literal("new"), z.null()]),
  syncFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

/** Saves which app account each bank account feeds and from when, then runs the first sync. */
export async function configureBankAccountsAction(input: { connectionId: string; choices: z.input<typeof choice>[] }): Promise<ActionResult<{ inserted: number }>> {
  try {
    const { db, user, household } = await requireContext();
    const data = z.object({ connectionId: z.string().uuid(), choices: z.array(choice).max(50) }).parse(input);
    await configureBankAccounts(db, { householdId: household.id, userId: user.id }, data.connectionId, data.choices);
    const result = await syncConnection(await getSystemDb(), data.connectionId, "initial");
    revalidateSynced();
    return ok({ inserted: result.inserted });
  } catch (error) {
    return fail(error);
  }
}

/** "Sync now", for the connection's owner, within the bank's daily access limit. */
export async function syncBankNowAction(connectionId: string): Promise<ActionResult<{ inserted: number }>> {
  try {
    const { db, user, household } = await requireContext();
    const id = z.string().uuid().parse(connectionId);
    const [connection] = await db
      .select({ createdBy: bankConnections.createdBy, status: bankConnections.status })
      .from(bankConnections)
      .where(and(eq(bankConnections.id, id), eq(bankConnections.householdId, household.id)));
    if (!connection) throw new UserError("bank_connection_not_found");
    if (connection.createdBy !== user.id) throw new UserError("bank_connection_not_yours");
    if (connection.status !== "active") throw new UserError("bank_sync_expired");
    const systemDb = await getSystemDb();
    if (!(await canSyncNow(systemDb, id))) throw new UserError("bank_sync_limit");
    const result = await syncConnection(systemDb, id, "manual");
    revalidateSynced();
    if (result.status === "expired") throw new UserError("bank_sync_expired");
    if (result.status === "limit") throw new UserError("bank_sync_limit");
    if (result.status === "error") throw new UserError("bank_unavailable");
    return ok({ inserted: result.inserted });
  } catch (error) {
    return fail(error);
  }
}

/** Revokes access at the bank and removes the connection; synced transactions stay. */
export async function disconnectBankAction(connectionId: string): Promise<ActionResult> {
  try {
    const { db, user, household } = await requireContext();
    await disconnectBank(db, { householdId: household.id, userId: user.id }, z.string().uuid().parse(connectionId));
    revalidateSynced();
    return ok();
  } catch (error) {
    return fail(error);
  }
}
