import { and, eq } from "drizzle-orm";
import { getUserDb } from "@/lib/db";
import { statements } from "@/lib/db/schema";
import { getMembership } from "@/lib/households";
import { getVisibleAccounts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/server/auth";
import { getStorage } from "@/lib/services/storage";

export const runtime = "nodejs";

/** Streams the original PDF so every number can be traced back to its source. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const db = await getUserDb(user.id);
  const membership = await getMembership(db, user.id);
  if (!membership || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });

  const [statement] = await db
    .select()
    .from(statements)
    .where(and(eq(statements.id, id), eq(statements.householdId, membership.household.id)));
  if (!statement) return new Response("Not found", { status: 404 });
  if (statement.accountId) {
    const visible = await getVisibleAccounts(db, membership.household.id, user.id, { includeArchived: true });
    if (!visible.some((a) => a.id === statement.accountId)) return new Response("Not found", { status: 404 });
  } else if (statement.uploadedBy !== user.id) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = await getStorage().get(statement.filePath);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(statement.fileName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
