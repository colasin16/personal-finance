/** Remembers where to go after the email link, which doesn't carry `next` (see README). */
export const AUTH_NEXT_COOKIE = "auth_next";

/** A same-site path to go to after signing in; anything else falls back to the dashboard. */
export const safeNext = (next: unknown) =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
