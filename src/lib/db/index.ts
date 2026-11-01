import path from "node:path";
import { mkdirSync } from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { seedBanks } from "./seed";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Runs as the `authenticated` role with auth.uid() = the user, so Row Level Security applies (drizzle/0006). */
const USER_CONTEXT_SQL = "select set_config('request.jwt.claim.sub', $1, true), set_config('role', 'authenticated', true)";

type Scoper = (userId: string) => Db;
const scopers = new WeakMap<Db, Scoper>();

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/**
 * Real Postgres (e.g. Supabase) when DATABASE_URL is set, otherwise an embedded PGlite
 * database stored in `.data/pglite` (or in memory for tests) so the app runs with zero setup.
 * Postgres is migrated by `pnpm db:migrate` at deploy time (`migrate: true`), not on every cold start.
 */
export async function createDb(options: { url?: string; dataDir?: string | "memory"; migrate?: boolean } = {}): Promise<Db> {
  const url = options.url ?? process.env.DATABASE_URL;
  let db: Db;

  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { prepare: false, max: 5, connect_timeout: 10 });
    const pgDb = drizzle(client, { schema });
    scopers.set(pgDb as unknown as Db, (userId) => drizzle(scopePostgres(client, userId), { schema }) as unknown as Db);
    if (!options.migrate) return pgDb as unknown as Db;
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
    scopers.set(db, (userId) => drizzle(scopePglite(client, userId), { schema }) as unknown as Db);
  }

  await seedBanks(db);
  return db;
}

/**
 * A view of `db` in which every statement runs in its own transaction as the `authenticated` role with
 * auth.uid() = userId, so Row Level Security applies on top of the app's own checks.
 */
export function asUser(db: Db, userId: string): Db {
  const scope = scopers.get(db);
  if (!scope) throw new Error("asUser needs a database created by createDb");
  return scope(userId);
}

type PostgresClient = import("postgres").Sql;
type PostgresTx = import("postgres").TransactionSql;

function scopePostgres(client: PostgresClient, userId: string): PostgresClient {
  const begin = (fn: (tx: PostgresTx) => unknown) =>
    client.begin(async (tx) => {
      await tx.unsafe(USER_CONTEXT_SQL, [userId]);
      return fn(tx);
    });
  // Drizzle calls `await client.unsafe(...)` or `client.unsafe(...).values()`; the context and the query are pipelined.
  const unsafe = (query: string, params?: never[], options?: object) => {
    const run = (values: boolean) =>
      client.begin((tx) => {
        const pending = tx.unsafe(query, params, options);
        return [tx.unsafe(USER_CONTEXT_SQL, [userId]), values ? pending.values() : pending];
      }).then((results) => (results as unknown[])[1]);
    return { values: () => run(true), then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => run(false).then(resolve, reject) };
  };
  return new Proxy(client, {
    get: (target, prop) => (prop === "begin" ? begin : prop === "unsafe" ? unsafe : Reflect.get(target, prop)),
  });
}

type Pglite = import("@electric-sql/pglite").PGlite;
type PgliteTx = import("@electric-sql/pglite").Transaction;

function scopePglite(client: Pglite, userId: string): Pglite {
  const transaction = <T>(fn: (tx: PgliteTx) => Promise<T>) =>
    client.transaction(async (tx) => {
      await tx.query(USER_CONTEXT_SQL, [userId]);
      return fn(tx);
    });
  const query = (sqlText: string, params?: unknown[], options?: object) => transaction((tx) => tx.query(sqlText, params, options));
  return new Proxy(client, {
    get: (target, prop) => {
      if (prop === "transaction") return transaction;
      if (prop === "query") return query;
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const globalForDb = globalThis as unknown as { __pfDb?: Promise<Db>; __pfUserDbs?: Map<string, Db> };

/**
 * The privileged connection: it bypasses Row Level Security. Only for work that happens before the user
 * has a household (sign-in, onboarding, invites) and for background jobs. Request handlers use getUserDb.
 */
export function getSystemDb(): Promise<Db> {
  globalForDb.__pfDb ??= createDb().catch((error) => {
    globalForDb.__pfDb = undefined;
    throw error;
  });
  return globalForDb.__pfDb;
}

/** The database as seen by this user: every query is subject to Row Level Security. */
export async function getUserDb(userId: string): Promise<Db> {
  const cache = (globalForDb.__pfUserDbs ??= new Map());
  let db = cache.get(userId);
  if (!db) {
    if (cache.size >= 100) cache.clear();
    db = asUser(await getSystemDb(), userId);
    cache.set(userId, db);
  }
  return db;
}

export { schema };
