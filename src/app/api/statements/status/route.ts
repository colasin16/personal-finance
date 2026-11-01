import { and, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getUserDb } from "@/lib/db";
import { statements } from "@/lib/db/schema";
import { getMembership } from "@/lib/households";
import { getVisibleAccounts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/server/auth";

export type StatementStatus = { id: string; status: string; progress: string | null; progressAt: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cheap progress check for the Import page, so it doesn't have to re-render the whole page while it waits. */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").filter((id) => UUID.test(id)).slice(0, 100);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  if (ids.length === 0) return NextResponse.json({ statuses: [] });
  const db = await getUserDb(user.id);
  const membership = await getMembership(db, user.id);
  if (!membership) return NextResponse.json({ error: "no_household" }, { status: 403 });

  const [rows, visible] = await Promise.all([
    db
      .select({ id: statements.id, status: statements.status, progress: statements.progress, progressAt: statements.progressAt, accountId: statements.accountId, uploadedBy: statements.uploadedBy })
      .from(statements)
      .where(and(eq(statements.householdId, membership.household.id), inArray(statements.id, ids))),
    getVisibleAccounts(db, membership.household.id, user.id, { includeArchived: true }),
  ]);
  const visibleIds = new Set(visible.map((a) => a.id));
  const statuses: StatementStatus[] = rows
    .filter((r) => (r.accountId ? visibleIds.has(r.accountId) : r.uploadedBy === user.id))
    .map(({ id, status, progress, progressAt }) => ({ id, status, progress, progressAt: progressAt.toISOString() }));
  return NextResponse.json({ statuses }, { headers: { "cache-control": "no-store" } });
}
