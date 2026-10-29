import { fn } from "storybook/test";
import type * as real from "@/lib/actions/household";

const done = { ok: true as const, data: undefined };

export const saveAccountAction = fn<typeof real.saveAccountAction>(async (_input, accountId) => ({ ok: true, data: { id: accountId ?? "new-account" } })).mockName(
  "saveAccountAction",
);
export const archiveAccountAction = fn<typeof real.archiveAccountAction>(async () => done).mockName("archiveAccountAction");
export const inviteMemberAction = fn<typeof real.inviteMemberAction>(async () => ({ ok: true, data: { url: "https://example.com/invite/demo" } })).mockName(
  "inviteMemberAction",
);
export const renameHouseholdAction = fn<typeof real.renameHouseholdAction>(async () => done).mockName("renameHouseholdAction");
export const createCategoryAction = fn<typeof real.createCategoryAction>(async () => ({ ok: true, data: { id: "new-category" } })).mockName("createCategoryAction");
export const createHouseholdAction = fn<typeof real.createHouseholdAction>().mockName("createHouseholdAction");
export const acceptInviteAction = fn<typeof real.acceptInviteAction>().mockName("acceptInviteAction");
