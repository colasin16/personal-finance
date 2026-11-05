import "server-only";
import type { ReactElement } from "react";
import { render, toPlainText } from "react-email";
import { Resend } from "resend";

export type Email = { to: string; subject: string; react: ReactElement };

let client: Resend | null | undefined;
const resend = () => (client ??= process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null);

/**
 * Renders a React Email template (src/emails) and sends it with Resend. Without `RESEND_API_KEY`
 * (local development) the email is logged instead. `idempotencyKey` stops a retried request from
 * sending the same email twice.
 */
export async function sendEmail({ to, subject, react }: Email, { idempotencyKey }: { idempotencyKey?: string } = {}) {
  const html = await render(react);
  const text = toPlainText(html);
  const api = resend();
  if (!api) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    console.info(`[email] RESEND_API_KEY is not set, so this email was not sent.\nTo: ${to}\nSubject: ${subject}\n\n${text}`);
    return;
  }
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set");
  const { error } = await api.emails.send({ from, to, subject, html, text }, idempotencyKey ? { idempotencyKey } : undefined);
  if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
}
