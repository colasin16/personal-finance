import type { useTranslations } from "next-intl";

type ErrorsT = ReturnType<typeof useTranslations<"errors">>;

/**
 * Translates an error code (or a stored legacy English message) with the `errors` namespace.
 * Unknown codes are returned unchanged so nothing is ever hidden from the user.
 */
export function translateError(t: ErrorsT, code: string, params?: Record<string, string | number>): string {
  const key = code as Parameters<ErrorsT>[0];
  return t.has(key) ? (t as (k: string, p?: Record<string, string | number>) => string)(key, params) : code;
}
