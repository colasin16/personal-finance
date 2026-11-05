import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAuthConfig } from "@/lib/supabase/config";

/** Refreshes the Supabase session cookies on every request (Server Components can't write cookies). */
export async function proxy(request: NextRequest) {
  const auth = supabaseAuthConfig();
  if (!auth) return NextResponse.next();

  // Supabase falls back to the Site URL when the requested redirect isn't allow-listed, so the
  // sign-in code can land on any page; hand it to the right auth page instead of dropping it.
  const { pathname, searchParams } = request.nextUrl;
  const target = searchParams.has("token_hash") ? "/auth/confirm" : searchParams.has("code") ? "/auth/callback" : null;
  if (target && pathname !== target && pathname !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(auth.url, auth.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf)$).*)"],
};
