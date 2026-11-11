import { NextResponse, type NextRequest } from "next/server";
import { BANK_CONNECTIONS_PATH, completeBankConnection, verifyAuthState } from "@/lib/bank-sync";
import { getCurrentUser } from "@/lib/server/auth";
import { getUserDb } from "@/lib/db";

/**
 * Where the bank sends the user back after approving (or refusing) access: `?code&state`, or `?error`.
 * The signed state must match the signed-in user; the connection is stored and the user picks what to sync.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const base = process.env.APP_URL ?? request.url;
  const back = (query: Record<string, string>) => NextResponse.redirect(new URL(`${BANK_CONNECTIONS_PATH}?${new URLSearchParams(query)}`, base));

  const state = verifyAuthState(params.get("state"));
  const user = await getCurrentUser();
  if (!state || !user || state.userId !== user.id) return back({ error: "bank_link_invalid" });

  const error = params.get("error");
  if (error) return back({ error: error === "access_denied" ? "bank_cancelled" : "bank_unavailable" });
  const code = params.get("code");
  if (!code) return back({ error: "bank_link_invalid" });

  try {
    const connectionId = await completeBankConnection(await getUserDb(user.id), state, code);
    return back({ setup: connectionId });
  } catch (e) {
    console.error("[bank-sync] callback failed", e instanceof Error ? e.message : e);
    return back({ error: "bank_unavailable" });
  }
}
