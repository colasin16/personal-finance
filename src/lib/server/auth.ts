import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ensureAuthUser, getMembership } from "@/lib/households";
import { supabaseAuthConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supabase Auth when configured (see `supabaseAuthConfig`); otherwise mock authentication for offline
 * development, where the session cookie holds the user id signed with AUTH_SECRET.
 */
export const authMode = (): "supabase" | "mock" => (supabaseAuthConfig() ? "supabase" : "mock");

const COOKIE = "pf_session";
const DEV_SECRET = "dev-only-insecure-secret";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_AUTH !== "1") {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  return value || DEV_SECRET;
}

const sign = (userId: string) => createHmac("sha256", secret()).update(userId).digest("base64url");

/** Mock mode only: Supabase sessions are started by the email link or code. */
export async function startSession(userId: string) {
  if (authMode() === "supabase") throw new Error("startSession is only available with mock auth.");
  (await cookies()).set(COOKIE, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function endSession() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  else (await cookies()).delete(COOKIE);
}

export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub || !claims.email) return null;
    const name = claims.user_metadata?.display_name;
    return ensureAuthUser(await getDb(), {
      id: claims.sub,
      email: claims.email,
      displayName: typeof name === "string" ? name : undefined,
    });
  }
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [userId, signature] = raw.split(".");
  if (!userId || !signature) return null;
  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Signed-in user + their household. Redirects to login/onboarding when missing. */
export const requireContext = cache(async () => {
  const user = await requireUser();
  const db = await getDb();
  const membership = await getMembership(db, user.id);
  if (!membership) redirect("/onboarding");
  return { db, user, household: membership.household, role: membership.role };
});

export type AppContext = Awaited<ReturnType<typeof requireContext>>;
