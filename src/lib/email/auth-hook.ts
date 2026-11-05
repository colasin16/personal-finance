import { createElement } from "react";
import { Webhook } from "standardwebhooks";
import AuthCodeEmail, { authCodeSubject } from "@/emails/auth-code";
import type { Locale } from "@/i18n/config";
import type { Email } from "./send";

/** The parts of Supabase's Send Email Hook request we use (https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook). */
export type SendEmailHookPayload = {
  user: { id: string; email: string; user_metadata?: Record<string, unknown> };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
};

/**
 * Checks the hook's signature and returns its payload; throws if it isn't from Supabase.
 * The secret is shown in Supabase as `v1,whsec_<base64>`.
 */
export function verifySendEmailHook(body: string, headers: Record<string, string>, secret: string): SendEmailHookPayload {
  const key = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  return new Webhook(key).verify(body, headers) as SendEmailHookPayload;
}

const KINDS: Record<string, "signup" | "signin" | undefined> = { signup: "signup", magiclink: "signin", email: "signin" };

/**
 * The email for a hook request, or null for email types the app doesn't use (password recovery,
 * email change, notifications…). The button links to `/auth/confirm`, which works in any browser,
 * and keeps the `next` page the user was heading to (e.g. an invite).
 */
export function authEmailFor(payload: SendEmailHookPayload, locale: Locale, appUrl: string): Email | null {
  const { user, email_data: data } = payload;
  const kind = KINDS[data.email_action_type];
  if (!kind) return null;
  const url = new URL("/auth/confirm", appUrl);
  url.searchParams.set("token_hash", data.token_hash);
  url.searchParams.set("type", "email");
  const next = safeParseUrl(data.redirect_to)?.searchParams.get("next");
  if (next) url.searchParams.set("next", next);
  const props = { locale, kind, code: data.token, url: url.toString(), email: user.email };
  return { to: user.email, subject: authCodeSubject(props), react: createElement(AuthCodeEmail, props) };
}

function safeParseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
