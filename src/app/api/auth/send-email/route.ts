import { eq, or } from "drizzle-orm";
import { getSystemDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { authEmailFor, verifySendEmailHook, type SendEmailHookPayload } from "@/lib/email/auth-hook";
import { sendEmail } from "@/lib/email/send";
import { emailLocale } from "@/emails/_components/i18n";

const hookError = (status: number, message: string) => Response.json({ error: { http_code: status, message } }, { status });

/**
 * Supabase Auth's Send Email Hook: Supabase calls this instead of sending its own templates.
 * We send the email in the user's language with React Email and Resend. See README.
 */
export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) return hookError(500, "The send email hook is not configured");

  const body = await request.text();
  let payload: SendEmailHookPayload;
  try {
    payload = verifySendEmailHook(body, Object.fromEntries(request.headers), secret);
  } catch {
    return hookError(401, "Invalid signature");
  }

  // Existing users: their saved language. New users: the language they signed up in (see signIn).
  const db = await getSystemDb();
  const [row] = await db.select({ locale: users.locale }).from(users).where(or(eq(users.id, payload.user.id), eq(users.email, payload.user.email.toLowerCase())));
  const locale = emailLocale(row?.locale ?? payload.user.user_metadata?.locale);

  const email = authEmailFor(payload, locale, process.env.APP_URL ?? payload.email_data.site_url);
  if (!email) {
    console.error("[email] unsupported auth email type", payload.email_data.email_action_type);
    return hookError(400, `Unsupported email type: ${payload.email_data.email_action_type}`);
  }
  try {
    const webhookId = request.headers.get("webhook-id");
    await sendEmail(email, { idempotencyKey: webhookId ? `supabase-auth/${webhookId}` : undefined });
  } catch (error) {
    console.error("[email] sending the auth email failed", error);
    return hookError(500, "Could not send the email");
  }
  return Response.json({});
}
