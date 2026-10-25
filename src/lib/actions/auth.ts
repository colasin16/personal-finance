"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { ensureDemoHousehold } from "@/lib/dev/demo";
import { findOrCreateUser } from "@/lib/households";
import { endSession, startSession } from "@/lib/server/auth";

const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");

/** Mock magic link: in this offline build signing in with an email logs you in immediately. */
export async function signIn(_: unknown, formData: FormData) {
  const parsed = z
    .object({ email: z.string().trim().email("Enter a valid email address"), name: z.string().trim().max(60).optional() })
    .safeParse({ email: formData.get("email"), name: formData.get("name") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const db = await getDb();
  const user = await findOrCreateUser(db, parsed.data.email, parsed.data.name);
  await startSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function signInDemo(who: "alex" | "sam") {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO !== "1") throw new Error("Demo is disabled");
  const db = await getDb();
  const { alex, sam } = await ensureDemoHousehold(db);
  await startSession(who === "sam" ? sam.id : alex.id);
  redirect("/dashboard");
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
