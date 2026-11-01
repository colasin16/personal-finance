import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSystemDb } from "@/lib/db";
import { ensureAuthUser } from "@/lib/households";
import { AUTH_NEXT_COOKIE, safeNext } from "@/lib/safe-next";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where the email link lands. Supports the default link (`?code=`, PKCE: same browser only) and a
 * `?token_hash=&type=` link from a customised email template, which works in any browser.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next") ?? request.cookies.get(AUTH_NEXT_COOKIE)?.value);
  // Behind a proxy request.url can be an internal address; APP_URL is the public one.
  const base = process.env.APP_URL ?? request.url;
  const fail = () => NextResponse.redirect(new URL(`/login?error=link_invalid&next=${encodeURIComponent(next)}`, base));

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.redirect(new URL("/login", base));

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { data: { user: null }, error: new Error("missing code") };
  if (error || !data.user?.email) {
    console.error("[auth] callback failed", error?.message);
    return fail();
  }

  const name = data.user.user_metadata?.display_name;
  await ensureAuthUser(await getSystemDb(), {
    id: data.user.id,
    email: data.user.email,
    displayName: typeof name === "string" ? name : undefined,
  });
  const response = NextResponse.redirect(new URL(next, base));
  response.cookies.delete({ name: AUTH_NEXT_COOKIE, path: "/auth" });
  return response;
}
