import { ZodError } from "zod";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
  if (error instanceof Error && !("digest" in error)) return { ok: false, error: error.message };
  throw error; // let Next.js handle redirect()/notFound() signals
}
