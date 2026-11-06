import { cookies } from "next/headers";
import { PRIVACY_COOKIE, parseAmountsHidden } from "@/lib/privacy";

/** Whether the user turned on incognito mode, for server components that format amounts themselves. */
export async function amountsHidden(): Promise<boolean> {
  return parseAmountsHidden((await cookies()).get(PRIVACY_COOKIE)?.value);
}
