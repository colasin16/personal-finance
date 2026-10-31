"use server";

import { UserError } from "@/lib/errors";
import { and, eq, isNull, lt, ne, notInArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { accounts, statements } from "@/lib/db/schema";
import { confirmStatement, processStatement } from "@/lib/pipeline/process-statement";
import { getVisibleAccounts } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { enqueue } from "@/lib/services/jobs";
import { getStorage } from "@/lib/services/storage";
import { STALE_PROCESSING_MS } from "@/lib/statement-processing";
import { fail, ok, type ActionResult } from "./result";

async function loadStatement(statementId: string) {
  const ctx = await requireContext();
  const [statement] = await ctx.db
    .select()
    .from(statements)
    .where(and(eq(statements.id, statementId), eq(statements.householdId, ctx.household.id)));
  if (!statement) throw new UserError("statement_not_found");
  if (statement.accountId) {
    const visible = await getVisibleAccounts(ctx.db, ctx.household.id, ctx.user.id, { includeArchived: true });
    if (!visible.some((a) => a.id === statement.accountId)) throw new UserError("statement_not_found");
  }
  return { ...ctx, statement };
}

function reprocess(db: Parameters<typeof processStatement>[0], statementId: string) {
  enqueue(`process:${statementId}`, () => processStatement(db, statementId));
}

export async function retryStatementAction(statementId: string): Promise<ActionResult> {
  try {
    const { db, statement } = await loadStatement(statementId);
    if (statement.status === "confirmed") throw new UserError("confirmed_cannot_reprocess");
    // Only one retry may win, and never while another instance is still actively processing it.
    const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
    const [claimed] = await db
      .update(statements)
      .set({ status: "uploaded", progress: "queued", progressAt: new Date(), error: null })
      .where(
        and(
          eq(statements.id, statement.id),
          ne(statements.status, "confirmed"),
          or(notInArray(statements.status, ["uploaded", "processing"]), lt(statements.progressAt, staleBefore)),
        ),
      )
      .returning({ id: statements.id });
    if (!claimed) throw new UserError("already_processing");
    reprocess(db, statement.id);
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

/** Assigns an unrecognised statement to an account and remembers the IBAN so next month is automatic. */
export async function assignStatementAccountAction(statementId: string, accountId: string): Promise<ActionResult> {
  try {
    const { db, household, user, statement } = await loadStatement(statementId);
    const visible = await getVisibleAccounts(db, household.id, user.id);
    const account = visible.find((a) => a.id === accountId);
    if (!account) throw new UserError("account_not_found");
    if (!account.ibanHash && statement.detected?.ibanHash) {
      await db
        .update(accounts)
        .set({ ibanHash: statement.detected.ibanHash, ibanLast4: statement.detected.ibanLast4 })
        .where(and(eq(accounts.id, accountId), isNull(accounts.ibanHash)));
    }
    await db.update(statements).set({ accountId, status: "uploaded", progress: "queued", progressAt: new Date(), error: null }).where(eq(statements.id, statement.id));
    reprocess(db, statement.id);
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function confirmStatementAction(statementId: string): Promise<ActionResult> {
  try {
    const { db, household, statement } = await loadStatement(statementId);
    if (!(await confirmStatement(db, household.id, statement.id))) throw new UserError("only_review_can_confirm");
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function deleteStatementAction(statementId: string): Promise<ActionResult> {
  try {
    const { db, statement } = await loadStatement(statementId);
    await db.delete(statements).where(eq(statements.id, statement.id)); // cascades to its transactions
    // Statements for other accounts in the same PDF share the file.
    const [stillUsed] = await db.select({ id: statements.id }).from(statements).where(eq(statements.filePath, statement.filePath)).limit(1);
    if (!stillUsed) {
      await getStorage()
        .remove(statement.filePath)
        .catch(() => undefined);
    }
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return fail(error);
  }
}
