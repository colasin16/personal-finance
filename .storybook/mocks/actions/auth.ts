import { fn } from "storybook/test";
import type * as real from "@/lib/actions/auth";

// Emails starting with "new" have no account yet, so they're asked for a name first.
export const signIn = fn<typeof real.signIn>(async (_, formData) => {
  const email = String(formData.get("email"));
  const name = String(formData.get("name") ?? "") || undefined;
  const isNew = email.startsWith("new");
  return isNew && !name ? { step: "name", email } : { step: "code", email, name, isNew };
}).mockName("signIn");
// Accepts 12345678; any other code shows the error state.
export const verifyEmailCode = fn<typeof real.verifyEmailCode>(async (_, formData) =>
  formData.get("code") === "12345678" ? null : { error: "That code is invalid or has expired." },
).mockName("verifyEmailCode");
export const confirmEmailLink = fn<typeof real.confirmEmailLink>().mockName("confirmEmailLink");
export const signInDemo = fn<typeof real.signInDemo>().mockName("signInDemo");
export const signOut = fn<typeof real.signOut>().mockName("signOut");
