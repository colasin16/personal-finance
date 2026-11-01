"use server";

import { UserError } from "@/lib/errors";
import { fail } from "./result";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSystemDb } from "@/lib/db";
import { ensureDemoHousehold } from "@/lib/dev/demo";
import { ensureAuthUser, findOrCreateUser } from "@/lib/households";
import { AUTH_NEXT_COOKIE, safeNext } from "@/lib/safe-next";
import { authMode, endSession, startSession } from "@/lib/server/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error?: string; sentTo?: string } | null;

/** The public URL of the app, for links in emails. */
async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/**
 * Emails a sign-in link (and one-time code) via Supabase Auth. In mock mode, signs in straight away.
 * Supabase creates the account on first sign-in; `name` is kept as its display name.
 */
export async function signIn(_: unknown, formData: FormData): Promise<SignInState> {
  const parsed = z
    .object({ email: z.string().trim().email("invalid_email"), name: z.string().trim().max(60).optional() })
    .safeParse({ email: formData.get("email"), name: formData.get("name") || undefined });
  if (!parsed.success) return { error: (await fail(parsed.error)).error };
  const { email, name } = parsed.data;
  const next = safeNext(formData.get("next"));

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
        data: name ? { display_name: name } : undefined,
      },
    });
    if (error) {
      console.error("[auth] signInWithOtp failed", error.status, error.message);
      return { error: (await fail(new UserError(error.status === 429 ? "auth_rate_limited" : "auth_email_failed"))).error };
    }
    (await cookies()).set(AUTH_NEXT_COOKIE, next, { httpOnly: true, sameSite: "lax", path: "/auth", maxAge: 60 * 60 });
    return { sentTo: email };
  }

  const db = await getSystemDb();
  const user = await findOrCreateUser(db, email, name);
  await startSession(user.id);
  redirect(next);
}

/** Signs in with the one-time code from the email: works even if the link opens in another browser. */
export async function verifyEmailCode(_: unknown, formData: FormData): Promise<SignInState> {
  const parsed = z
    .object({ email: z.string().trim().email("invalid_email"), code: z.string().trim().regex(/^\d{6,10}$/, "auth_code_invalid") })
    .safeParse({ email: formData.get("email"), code: formData.get("code") });
  if (!parsed.success) return { error: (await fail(parsed.error)).error, sentTo: String(formData.get("email") ?? "") };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: (await fail(new Error("Supabase Auth is not configured"))).error };

  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "email" });
  if (error || !data.user) {
    return { error: (await fail(new UserError("auth_code_invalid"))).error, sentTo: parsed.data.email };
  }
  const name = data.user.user_metadata?.display_name;
  await ensureAuthUser(await getSystemDb(), {
    id: data.user.id,
    email: data.user.email ?? parsed.data.email,
    displayName: typeof name === "string" ? name : undefined,
  });
  redirect(safeNext(formData.get("next")));
}

export async function signInDemo(who: "alex" | "sam") {
  const demoAllowed = authMode() === "mock" && (process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO === "1");
  if (!demoAllowed) throw new UserError("demo_disabled");
  const db = await getSystemDb();
  const { alex, sam } = await ensureDemoHousehold(db);
  await startSession(who === "sam" ? sam.id : alex.id);
  redirect("/dashboard");
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
