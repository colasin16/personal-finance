import { fn } from "storybook/test";
import type * as real from "@/lib/actions/auth";

export const signIn = fn<typeof real.signIn>().mockName("signIn");
export const signInDemo = fn<typeof real.signInDemo>().mockName("signInDemo");
export const signOut = fn<typeof real.signOut>().mockName("signOut");
