import { fn } from "storybook/test";
import type * as real from "@/lib/actions/transactions";

export type { RuleInput, TransactionListFilters } from "@/lib/actions/transactions";
import { transactions as fixtureRows } from "../../../src/stories/fixtures";

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
export const findTransferMatchesAction = fn<typeof real.findTransferMatchesAction>(async () => ({
  ok: true,
  data: [
    {
      id: "match-1",
      bookedAt: "2026-09-02",
      description: "Transferencia a Cuenta Común",
      amountCents: -90000,
      currency: "EUR",
      account: { name: "Cuenta Nómina Alex", bankId: "ing", bankName: "ING", bankColor: "#ff6200", ibanLast4: "8901" },
    },
  ],
})).mockName("findTransferMatchesAction");
/** Stories pass cursor "batch:1": three more batches of the fixture rows, a month earlier each time, then the end. */
export const loadMoreTransactionsAction = fn<typeof real.loadMoreTransactionsAction>(async (_filters, cursor) => {
  await new Promise((r) => setTimeout(r, 600));
  const batch = Number(cursor.split(":")[1] ?? 1);
  const month = String(9 - batch).padStart(2, "0");
  return {
    ok: true,
    data: {
      rows: fixtureRows.map((t) => ({ ...t, id: `${t.id}-b${batch}`, bookedAt: `2026-${month}${t.bookedAt.slice(7)}` })),
      cursor: batch < 3 ? `batch:${batch + 1}` : null,
    },
  };
}).mockName("loadMoreTransactionsAction");
