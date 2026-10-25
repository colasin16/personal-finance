import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getDb } from "@/lib/db";
import { getMembership } from "@/lib/households";
import { processStatement } from "@/lib/pipeline/process-statement";
import { createStatementFromUpload, UploadError } from "@/lib/pipeline/upload";
import { getVisibleAccounts } from "@/lib/queries";
import { enqueue } from "@/lib/services/jobs";

export const runtime = "nodejs";

export type UploadResult = { fileName: string; statementId?: string; duplicate?: boolean; error?: string };

/** Multi-file PDF upload. Processing continues in the background job queue after the response. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = await getDb();
  const membership = await getMembership(db, user.id);
  if (!membership) return NextResponse.json({ error: "Create a household first" }, { status: 403 });
  const householdId = membership.household.id;

  const form = await request.formData();
  const accountId = (form.get("accountId") as string | null) || null;
  if (accountId) {
    const visible = await getVisibleAccounts(db, householdId, user.id);
    if (!visible.some((a) => a.id === accountId)) return NextResponse.json({ error: "Unknown account" }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files received" }, { status: 400 });
  if (files.length > 50) return NextResponse.json({ error: "Upload at most 50 files at once" }, { status: 400 });

  const results: UploadResult[] = [];
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { statement, duplicate } = await createStatementFromUpload(db, { householdId, userId: user.id, fileName: file.name, bytes, accountId });
      if (!duplicate) enqueue(`process:${statement.id}`, () => processStatement(db, statement.id));
      results.push({ fileName: file.name, statementId: statement.id, duplicate });
    } catch (error) {
      if (!(error instanceof UploadError)) console.error("[upload]", error);
      results.push({ fileName: file.name, error: error instanceof UploadError ? error.message : "Upload failed" });
    }
  }
  return NextResponse.json({ results });
}
