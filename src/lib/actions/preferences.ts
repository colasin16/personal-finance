"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getUserDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/server/auth";

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // Also saved on the user, so emails are sent in this language.
  const user = await getCurrentUser();
  if (user) await (await getUserDb(user.id)).update(users).set({ locale }).where(eq(users.id, user.id));
}
