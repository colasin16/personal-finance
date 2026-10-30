/** Supabase Auth is used when the project URL and its publishable (anon) key are set; otherwise auth is mocked. */
export function supabaseAuthConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}
