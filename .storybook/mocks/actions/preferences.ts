import { fn } from "storybook/test";
import type * as real from "@/lib/actions/preferences";

export const setLocaleAction = fn<typeof real.setLocaleAction>().mockName("setLocaleAction");
