import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { seedBanks } from "@/lib/db/seed";
import { createAccount, createHousehold, findOrCreateUser } from "@/lib/households";

/** Emulates Supabase's auth.uid() and `authenticated` role to verify supabase/rls.sql on PGlite. */
describe("row level security (supabase/rls.sql)", () => {
  const client = new PGlite();
  let alex: string, sam: string, eve: string;

  async function as<T>(userId: string, query: string): Promise<T[]> {
    return client.transaction(async (tx) => {
      await tx.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${userId}', true);`);
      return (await tx.query<T>(query)).rows;
    });
  }

  beforeAll(async () => {
    const db = drizzle(client, { schema }) as unknown as Db;
    await migrate(drizzle(client, { schema }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await seedBanks(db);
    await client.exec(`
      create schema if not exists auth;
      create or replace function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role authenticated;
      grant usage on schema public, auth to authenticated;
      grant all on all tables in schema public to authenticated;
    `);
    await client.exec(await readFile(path.join(process.cwd(), "supabase", "rls.sql"), "utf8"));

    alex = (await findOrCreateUser(db, "alex@example.com")).id;
    sam = (await findOrCreateUser(db, "sam@example.com")).id;
    eve = (await findOrCreateUser(db, "eve@example.com")).id;
    const home = await createHousehold(db, alex, "Alex & Sam");
    await db.insert(schema.householdMembers).values({ householdId: home.id, userId: sam });
    await createHousehold(db, eve, "Eve");
    await createAccount(db, home.id, { bankId: "ing", name: "Shared", owners: [{ userId: alex, sharePct: 50 }, { userId: sam, sharePct: 50 }] });
    await createAccount(db, home.id, { bankId: "bbva", name: "Alex private", isPrivate: true, owners: [{ userId: alex, sharePct: 100 }] });
  });

  it("isolates households", async () => {
    expect(await as(eve, "select name from accounts")).toEqual([]);
    expect((await as<{ name: string }>(eve, "select name from households")).map((h) => h.name)).toEqual(["Eve"]);
  });

  it("hides private accounts from the partner but not from the owner", async () => {
    expect((await as<{ name: string }>(alex, "select name from accounts order by name")).map((a) => a.name)).toEqual(["Alex private", "Shared"]);
    expect((await as<{ name: string }>(sam, "select name from accounts")).map((a) => a.name)).toEqual(["Shared"]);
  });
});
