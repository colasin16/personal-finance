import { fn } from "storybook/test";
import type * as real from "@/lib/actions/transactions";

export type { RuleInput } from "@/lib/actions/transactions";

const done = { ok: true as const, data: undefined };

export const setCategoryAction = fn<typeof real.setCategoryAction>(async (ids) => ({ ok: true, data: { updated: ids.length } })).mockName("setCategoryAction");
export const setNotesAction = fn<typeof real.setNotesAction>(async () => done).mockName("setNotesAction");
export const excludeTransactionsAction = fn<typeof real.excludeTransactionsAction>(async (ids) => ({ ok: true, data: { updated: ids.length } })).mockName(
  "excludeTransactionsAction",
);
export const restoreTransactionsAction = fn<typeof real.restoreTransactionsAction>(async (ids) => ({ ok: true, data: { updated: ids.length } })).mockName(
  "restoreTransactionsAction",
);
export const getTransactionHistoryAction = fn<typeof real.getTransactionHistoryAction>(async () => []).mockName("getTransactionHistoryAction");
export const previewRuleAction = fn<typeof real.previewRuleAction>(async ({ pattern }) => ({
  ok: true,
  data: { count: 3, examples: [`${pattern} 1234 MADRID`, `${pattern} ONLINE`, `COMPRA ${pattern}`] },
})).mockName("previewRuleAction");
export const createRuleAction = fn<typeof real.createRuleAction>(async (_input, applyToExisting) => ({
  ok: true,
  data: { applied: applyToExisting ? 3 : 0 },
})).mockName("createRuleAction");
export const updateRuleAction = fn<typeof real.updateRuleAction>(async (_id, _input, applyToExisting) => ({
  ok: true,
  data: { applied: applyToExisting ? 3 : 0 },
})).mockName("updateRuleAction");
export const setRuleEnabledAction = fn<typeof real.setRuleEnabledAction>(async () => done).mockName("setRuleEnabledAction");
export const reorderRulesAction = fn<typeof real.reorderRulesAction>(async () => done).mockName("reorderRulesAction");
export const applyAllRulesAction = fn<typeof real.applyAllRulesAction>(async () => ({ ok: true, data: { applied: 12 } })).mockName("applyAllRulesAction");
export const deleteRuleAction = fn<typeof real.deleteRuleAction>(async () => done).mockName("deleteRuleAction");
export const categorizeMerchantAction = fn<typeof real.categorizeMerchantAction>(async (ids) => ({ ok: true, data: { updated: ids.length } })).mockName("categorizeMerchantAction");
export const linkTransferAction = fn<typeof real.linkTransferAction>(async () => done).mockName("linkTransferAction");
export const unlinkTransferAction = fn<typeof real.unlinkTransferAction>(async () => done).mockName("unlinkTransferAction");
export const dismissSuggestionAction = fn<typeof real.dismissSuggestionAction>(async () => done).mockName("dismissSuggestionAction");
