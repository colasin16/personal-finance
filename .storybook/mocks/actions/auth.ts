import { fn } from "storybook/test";
import type * as real from "@/lib/actions/auth";

export const signIn = fn<typeof real.signIn>(async (_, formData) => ({ sentTo: String(formData.get("email")) })).mockName("signIn");
// Accepts 12345678; any other code shows the error state.
export const verifyEmailCode = fn<typeof real.verifyEmailCode>(async (_, formData) =>
  formData.get("code") === "12345678" ? null : { error: "That code is invalid or has expired.", sentTo: String(formData.get("email")) },
).mockName("verifyEmailCode");
export const signInDemo = fn<typeof real.signInDemo>().mockName("signInDemo");
export const signOut = fn<typeof real.signOut>().mockName("signOut");
