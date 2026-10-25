import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

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
export class SupabaseFileStorage implements FileStorage {
  readonly kind = "supabase";
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "statements",
  ) {}

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
    });
    if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`);
  }

  async get(key: string) {
    const res = await fetch(this.endpoint(key), { headers: this.headers() });
    if (!res.ok) throw new Error(`Supabase download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async remove(key: string) {
    const res = await fetch(this.endpoint(key), { method: "DELETE", headers: this.headers() });
    if (!res.ok && res.status !== 404) throw new Error(`Supabase delete failed: ${res.status}`);
  }
}

let storage: FileStorage | undefined;

export function getStorage(): FileStorage {
  if (!storage) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    storage =
      SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? new SupabaseFileStorage(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        : new LocalFileStorage();
  }
  return storage;
}
