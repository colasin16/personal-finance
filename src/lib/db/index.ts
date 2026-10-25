import path from "node:path";
import { mkdirSync } from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { seedBanks } from "./seed";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/**
 * Real Postgres (e.g. Supabase) when DATABASE_URL is set, otherwise an embedded PGlite
 * database stored in `.data/pglite` (or in memory for tests) so the app runs with zero setup.
 */
export async function createDb(options: { url?: string; dataDir?: string | "memory" } = {}): Promise<Db> {
  const url = options.url ?? process.env.DATABASE_URL;
  let db: Db;

  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { prepare: false, max: 5 });
    const pgDb = drizzle(client, { schema });
    await migrate(pgDb, { migrationsFolder: MIGRATIONS_FOLDER });
    db = pgDb as unknown as Db;
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dataDir = options.dataDir ?? process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
    if (dataDir !== "memory") mkdirSync(dataDir, { recursive: true });
    const client = dataDir === "memory" ? new PGlite() : new PGlite(dataDir);
    const liteDb = drizzle(client, { schema });
    await migrate(liteDb, { migrationsFolder: MIGRATIONS_FOLDER });
    db = liteDb as unknown as Db;
  }

  await seedBanks(db);
  return db;
}

const globalForDb = globalThis as unknown as { __pfDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__pfDb ??= createDb().catch((error) => {
    globalForDb.__pfDb = undefined;
    throw error;
  });
  return globalForDb.__pfDb;
}

export { schema };
