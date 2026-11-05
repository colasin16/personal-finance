"use server";

import { UserError } from "@/lib/errors";
import { fail } from "./result";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { LOCALE_COOKIE } from "@/i18n/config";
import { resolveLocale } from "@/i18n/request";
import { getSystemDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ensureDemoHousehold } from "@/lib/dev/demo";
import { ensureAuthUser, findOrCreateUser, userExists } from "@/lib/households";
import { AUTH_NEXT_COOKIE, safeNext } from "@/lib/safe-next";
import { authMode, endSession, startSession } from "@/lib/server/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = {
  error?: string;
  /** What to ask next for `email`: a name (no account yet), or the code we just emailed. */
  step?: "name" | "code";
  email?: string;
  name?: string;
  isNew?: boolean;
} | null;

/** The public URL of the app, for links in emails. */
async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/**
 * Email-first sign-in: a known email gets a one-time code straight away; a new one is first asked
 * for a name (`step: "name"`), then gets the code. Supabase creates the account on first sign-in and
 * keeps `name` as its display name. In mock mode, signs in straight away instead of emailing.
 */
export async function signIn(_: unknown, formData: FormData): Promise<SignInState> {
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = z
    .object({ email: z.string().trim().email("invalid_email"), name: z.string().trim().max(60).optional() })
    .safeParse({ email: rawEmail, name: formData.get("name") || undefined });
  if (!parsed.success) {
    return { error: (await fail(parsed.error)).error, email: rawEmail, step: formData.has("name") ? "name" : undefined };
  }
  const { email, name } = parsed.data;
  const next = safeNext(formData.get("next"));
  const db = await getSystemDb();
  const isNew = !(await userExists(db, email));
  if (isNew && !name) return { step: "name", email };

  // Emails go out in the language of the page the user signs in from: new users get it as sign-up
  // metadata (the email is sent before their app user exists); a language picked here is saved.
  const locale = await resolveLocale();
  if (!isNew && (await cookies()).has(LOCALE_COOKIE)) await db.update(users).set({ locale }).where(eq(users.email, email.toLowerCase()));

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
        data: { ...(name && { display_name: name }), locale },
      },
    });
    if (error) {
      console.error("[auth] signInWithOtp failed", error.status, error.message);
      const message = (await fail(new UserError(error.status === 429 ? "auth_rate_limited" : "auth_email_failed"))).error;
      return { error: message, email, name, step: isNew ? "name" : undefined };
    }
    (await cookies()).set(AUTH_NEXT_COOKIE, next, { httpOnly: true, sameSite: "lax", path: "/auth", maxAge: 60 * 60 });
    return { step: "code", email, name, isNew };
  }

  const user = await findOrCreateUser(db, email, name, locale);
  await startSession(user.id);
  redirect(next);
}

/** Creates the app user for a freshly verified Supabase user (first sign-in) or finds the existing one. */
async function syncAuthUser(user: User, fallbackEmail?: string) {
  const name = user.user_metadata?.display_name;
  await ensureAuthUser(await getSystemDb(), {
    id: user.id,
    email: user.email ?? fallbackEmail ?? "",
    displayName: typeof name === "string" ? name : undefined,
    locale: user.user_metadata?.locale,
  });
}

/** Signs in with the one-time code from the email: works even if the email is read on another device. */
export async function verifyEmailCode(_: unknown, formData: FormData): Promise<SignInState> {
  const parsed = z
    .object({ email: z.string().trim().email("invalid_email"), code: z.string().trim().regex(/^\d{6,10}$/, "auth_code_invalid") })
    .safeParse({ email: formData.get("email"), code: formData.get("code") });
  if (!parsed.success) return { error: (await fail(parsed.error)).error };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: (await fail(new Error("Supabase Auth is not configured"))).error };

  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "email" });
  if (error || !data.user) return { error: (await fail(new UserError("auth_code_invalid"))).error };
  await syncAuthUser(data.user, parsed.data.email);
  redirect(safeNext(formData.get("next")));
}

const LINK_TYPES = ["email", "signup", "magiclink"] as const;
const isLinkType = (type: string): type is (typeof LINK_TYPES)[number] => (LINK_TYPES as readonly string[]).includes(type);

/**
 * Confirms the link from the email (`/auth/confirm`). It's a POST behind a button rather than a GET,
 * because mail scanners open links and would otherwise use up the one-time token.
 */
export async function confirmEmailLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "email");
  const jar = await cookies();
  const next = safeNext(formData.get("next") || jar.get(AUTH_NEXT_COOKIE)?.value);
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");

  const { data, error } =
    tokenHash && isLinkType(type)
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { data: { user: null }, error: new Error("missing or unsupported token") };
  if (error || !data.user?.email) {
    console.error("[auth] email link failed", error?.message);
    redirect(`/login?error=link_invalid&next=${encodeURIComponent(next)}`);
  }
  await syncAuthUser(data.user);
  jar.delete({ name: AUTH_NEXT_COOKIE, path: "/auth" });
  redirect(next);
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
