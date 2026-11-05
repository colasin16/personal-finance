import { NextResponse, type NextRequest } from "next/server";
import { getSystemDb } from "@/lib/db";
import { ensureAuthUser } from "@/lib/households";
import { AUTH_NEXT_COOKIE, safeNext } from "@/lib/safe-next";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where Supabase's default email link lands (`?code=`, PKCE). It only works in the browser that
 * asked for the email; elsewhere the user is sent back to sign in with the code instead. Links from
 * the customised templates (`?token_hash=`, any browser) go to `/auth/confirm`.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  // Behind a proxy request.url can be an internal address; APP_URL is the public one.
  const base = process.env.APP_URL ?? request.url;
  if (params.has("token_hash")) return NextResponse.redirect(new URL(`/auth/confirm?${params}`, base));

  const next = safeNext(params.get("next") ?? request.cookies.get(AUTH_NEXT_COOKIE)?.value);
  const fail = () => NextResponse.redirect(new URL(`/login?error=link_invalid&next=${encodeURIComponent(next)}`, base));

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.redirect(new URL("/login", base));

  const code = params.get("code");
  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : { data: { user: null }, error: new Error(params.get("error_description") ?? "missing code") };
  if (error || !data.user?.email) {
    console.error("[auth] callback failed", error?.message);
    return fail();
  }

  const name = data.user.user_metadata?.display_name;
  await ensureAuthUser(await getSystemDb(), {
    id: data.user.id,
    email: data.user.email,
    displayName: typeof name === "string" ? name : undefined,
    locale: data.user.user_metadata?.locale,
  });
  const response = NextResponse.redirect(new URL(next, base));
  response.cookies.delete({ name: AUTH_NEXT_COOKIE, path: "/auth" });
  return response;
}
