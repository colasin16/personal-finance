/**
 * One-off, idempotent migration for data stored before encryption at rest:
 * encrypts plaintext statement PDFs and replaces unkeyed IBAN hashes on accounts and statements.
 * Run once after deploying, with the production env: `pnpm exec tsx --env-file=.env.production.local scripts/secure-existing-data.ts`.
 */
import { eq } from "drizzle-orm";
import { decryptBytes, encryptBytes, isEncrypted } from "@/lib/crypto";
import { createDb } from "@/lib/db";
import { statements } from "@/lib/db/schema";
import { findSectionIbans } from "@/lib/domain/sections";
import { findIbans } from "@/lib/domain/redact";
import { extractPdfText } from "@/lib/pipeline/extract-text";
import { ibanHash, legacyIbanHash, upgradeLegacyIbanHashes } from "@/lib/pipeline/process-statement";
import { getRawStorage } from "@/lib/services/storage";

if (!process.env.DATA_ENCRYPTION_KEY || !process.env.DATABASE_URL) {
  // Without these the script would silently use the dev key or the local database.
  console.error("[secure:data] DATA_ENCRYPTION_KEY and DATABASE_URL must be set (use the production env).");
  process.exit(1);
}

const db = await createDb();
const storage = getRawStorage();
let encrypted = 0;
let upgradedAccounts = 0;
let upgradedStatements = 0;
let failed = 0;

for (const statement of await db.select().from(statements)) {
  try {
    const raw = await storage.get(statement.filePath);
    const plain = decryptBytes(raw, statement.filePath);
    const { text } = await extractPdfText(plain);
    const ibans = [...new Set([...findSectionIbans(text), ...findIbans(text)])];
    upgradedAccounts += await upgradeLegacyIbanHashes(db, statement.householdId, ibans);

    const detectedHash = statement.detected?.ibanHash;
    const match = detectedHash && ibans.find((iban) => legacyIbanHash(statement.householdId, iban) === detectedHash);
    if (match) {
      await db
        .update(statements)
        .set({ detected: { ...statement.detected!, ibanHash: ibanHash(statement.householdId, match) } })
        .where(eq(statements.id, statement.id));
      upgradedStatements++;
    }

    if (!isEncrypted(raw)) {
      await storage.put(statement.filePath, encryptBytes(plain, statement.filePath), "application/octet-stream");
      encrypted++;
    }
  } catch (error) {
    failed++;
    console.error(`[secure:data] statement ${statement.id}:`, error instanceof Error ? error.message : error);
  }
}

console.log(`[secure:data] encrypted ${encrypted} files, upgraded ${upgradedAccounts} account and ${upgradedStatements} statement IBAN hashes, ${failed} failed`);
process.exit(failed ? 1 : 0);
