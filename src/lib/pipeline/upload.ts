import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { accounts, statements } from "@/lib/db/schema";
import { sha256 } from "@/lib/domain/text";
import { getStorage, type FileStorage } from "@/lib/services/storage";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export class UploadError extends Error {}

export async function createStatementFromUpload(
  db: Db,
  input: { householdId: string; userId: string; fileName: string; bytes: Uint8Array; accountId?: string | null },
  storage: FileStorage = getStorage(),
) {
  const { householdId, userId, fileName, bytes } = input;
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new UploadError(`${fileName} is larger than 15 MB.`);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new UploadError(`${fileName} is not a PDF file.`);

  const accountId = input.accountId || null;
  if (accountId) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)));
    if (!account) throw new UploadError("Unknown account.");
  }

  const fileSha256 = sha256(bytes);
  const [existing] = await db
    .select()
    .from(statements)
    .where(and(eq(statements.householdId, householdId), eq(statements.fileSha256, fileSha256)));
  if (existing) return { statement: existing, duplicate: true as const };

  const id = crypto.randomUUID();
  const filePath = `${householdId}/${id}.pdf`;
  await storage.put(filePath, bytes, "application/pdf");
  const [statement] = await db
    .insert(statements)
    .values({ id, householdId, accountId, uploadedBy: userId, fileName: fileName.slice(0, 200), filePath, fileSha256 })
    .returning();
  return { statement: statement!, duplicate: false as const };
}
