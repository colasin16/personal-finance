import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createElement } from "react";
import { BANK_CONNECTIONS_PATH, runDailyBankSync } from "@/lib/bank-sync";
import { getSystemDb } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import BankConsentExpiringEmail, { bankConsentExpiringSubject } from "@/emails/bank-consent-expiring";
import { emailLocale } from "@/emails/_components/i18n";

export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Without a secret only local development may trigger it.
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Daily bank sync (Vercel Cron, see vercel.json): expiry reminders, then new transactions for every connection. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const origin = (process.env.APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  const summary = await runDailyBankSync(await getSystemDb(), {
    deadline: Date.now() + (maxDuration - 30) * 1000,
    sendReminder: async ({ to, locale, bankName, days, reminder, connectionId, validUntil }) => {
      const props = { locale: emailLocale(locale), bankName, days, url: `${origin}${BANK_CONNECTIONS_PATH}`, email: to };
      await sendEmail(
        { to, subject: bankConsentExpiringSubject(props), react: createElement(BankConsentExpiringEmail, props) },
        { idempotencyKey: `bank-consent/${connectionId}/${validUntil.getTime()}/${reminder}` },
      );
    },
  });
  for (const path of ["/budgets", "/dashboard", "/transactions", "/issues", BANK_CONNECTIONS_PATH]) revalidatePath(path);
  return NextResponse.json(summary);
}
