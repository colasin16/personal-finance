import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { translateError } from "@/i18n/errors";
import { UserError } from "@/lib/errors";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

/** Converts a thrown error into a translated, user-facing failure result. */
export async function fail(error: unknown): Promise<{ ok: false; error: string }> {
  if (error instanceof Error && "digest" in error) throw error; // let Next.js handle redirect()/notFound() signals
  const t = await getTranslations("errors");
  if (error instanceof ZodError) return { ok: false, error: translateError(t, error.issues[0]?.message ?? "invalid_input") };
  if (error instanceof UserError) return { ok: false, error: translateError(t, error.code, error.params) };
  console.error("[action]", error);
  return { ok: false, error: t("unexpected") };
}
