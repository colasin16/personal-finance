import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptBytes, encryptBytes } from "@/lib/crypto";

export interface FileStorage {
  readonly kind: string;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

/** Local filesystem storage — the default stand-in for Supabase Storage in development. */
export class LocalFileStorage implements FileStorage {
  readonly kind = "local";
  constructor(private readonly root = process.env.UPLOADS_DIR ?? path.join(process.cwd(), ".data", "uploads")) {}

  private resolve(key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return target;
  }

  async put(key: string, bytes: Uint8Array) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }

  async get(key: string) {
    return new Uint8Array(await readFile(this.resolve(key)));
  }

  async remove(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

/** Supabase Storage via its REST API (private bucket, service role key — server side only). */
const REQUEST_TIMEOUT_MS = 30_000;

export class SupabaseFileStorage implements FileStorage {
  readonly kind = "supabase";
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "statements",
  ) {}

  /** Bounds every request (including reading the body) so a hung connection can't block processing. */
  private signal() {
    return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }

  private endpoint(key: string) {
    return `${this.url.replace(/\/$/, "")}/storage/v1/object/${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    const res = await fetch(this.endpoint(key), {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "true" }),
      body: Buffer.from(bytes),
      signal: this.signal(),
    });
    if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`);
  }

  async get(key: string) {
    const res = await fetch(this.endpoint(key), { headers: this.headers(), signal: this.signal() });
    if (!res.ok) throw new Error(`Supabase download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async remove(key: string) {
    const res = await fetch(this.endpoint(key), { method: "DELETE", headers: this.headers(), signal: this.signal() });
    if (!res.ok && res.status !== 404) throw new Error(`Supabase delete failed: ${res.status}`);
  }
}

/** Encrypts files before they reach the underlying storage, so a bucket or disk leak exposes only ciphertext. */
export class EncryptedFileStorage implements FileStorage {
  constructor(private readonly inner: FileStorage) {}

  get kind() {
    return this.inner.kind;
  }

  put(key: string, bytes: Uint8Array) {
    return this.inner.put(key, encryptBytes(bytes, key), "application/octet-stream");
  }

  async get(key: string) {
    return decryptBytes(await this.inner.get(key), key);
  }

  remove(key: string) {
    return this.inner.remove(key);
  }
}

let storage: FileStorage | undefined;

/** The configured backend without encryption — only for maintenance scripts that migrate existing files. */
export function getRawStorage(): FileStorage {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  return SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? new SupabaseFileStorage(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : new LocalFileStorage();
}

export function getStorage(): FileStorage {
  storage ??= new EncryptedFileStorage(getRawStorage());
  return storage;
}
