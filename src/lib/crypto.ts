import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * App-level keys, all derived from DATA_ENCRYPTION_KEY (≥ 32 random bytes, base64). Generate one with
 * `openssl rand -base64 32`. It must be set in production; development falls back to a fixed, insecure key.
 * Changing it makes stored IBAN hashes stop matching and encrypted PDFs unreadable.
 */
const DEV_KEY = Buffer.from("dev-only-insecure-data-key-not-for-production");

let master: Buffer | undefined;
const subkeys = new Map<string, Buffer>();

function masterKey() {
  if (master) return master;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("DATA_ENCRYPTION_KEY must be set in production.");
    return (master = DEV_KEY);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length < 32) throw new Error("DATA_ENCRYPTION_KEY must be at least 32 bytes, base64-encoded.");
  return (master = key);
}

function subkey(purpose: "iban-hash" | "file-encryption") {
  let key = subkeys.get(purpose);
  if (!key) subkeys.set(purpose, (key = Buffer.from(hkdfSync("sha256", masterKey(), Buffer.alloc(0), `personal-finance/${purpose}`, 32))));
  return key;
}

/** Keyed hash of an IBAN: without the server key it can't be brute-forced from the few unknown digits. */
export const hmacIban = (value: string) => createHmac("sha256", subkey("iban-hash")).update(value).digest("hex");

const MAGIC = Buffer.from("PFENC1\0");
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const isEncrypted = (data: Uint8Array) => data.byteLength > MAGIC.length && Buffer.from(data.subarray(0, MAGIC.length)).equals(MAGIC);

/** AES-256-GCM; `context` (e.g. the storage key) is authenticated so a file can't be swapped for another. */
export function encryptBytes(plain: Uint8Array, context: string): Uint8Array {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", subkey("file-encryption"), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return new Uint8Array(Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()]));
}

/** Decrypts `encryptBytes` output. Files stored before encryption existed are returned as they are. */
export function decryptBytes(data: Uint8Array, context: string): Uint8Array {
  if (!isEncrypted(data)) return data;
  const buf = Buffer.from(data);
  const iv = buf.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", subkey("file-encryption"), iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(buf.subarray(MAGIC.length + IV_BYTES, buf.length - TAG_BYTES)), decipher.final()]));
}
