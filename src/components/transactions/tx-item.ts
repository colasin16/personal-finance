import type { AccountRefData } from "@/components/accounts/account-ref";
import type { LinkedTransaction } from "@/lib/queries";

export type AppliedRule = { matchType: "contains" | "regex" | "merchant"; pattern: string; categoryId: string };

export type TxItem = {
  id: string;
  bookedAt: string;
  descriptionRaw: string;
  merchant: string | null;
  amountCents: number;
  currency: string;
  balanceAfterCents: number | null;
  account: AccountRefData;
  categoryId: string | null;
  categorizedBy: string | null;
  categoryConfidence: number | null;
  flagged: boolean;
  flagReason: string | null;
  transferGroupId: string | null;
  /** The other side(s) of a linked transfer. */
  linked: LinkedTransaction[];
  notes: string | null;
  statementId: string | null;
  isConfirmed: boolean;
  excluded: boolean;
  /** The rule that set the category, when it still exists. */
  rule: AppliedRule | null;
};

export function toTxItem(row: {
  tx: {
    id: string;
    bookedAt: string;
    descriptionRaw: string;
    merchant: string | null;
    amountCents: number;
    currency: string;
    balanceAfterCents: number | null;
    categoryId: string | null;
    categorizedBy: string | null;
    categoryConfidence: number | null;
    flagged: boolean;
    flagReason: string | null;
    transferGroupId: string | null;
    notes: string | null;
    statementId: string | null;
    isConfirmed: boolean;
    excludedAt: Date | null;
  };
  accountName: string;
  ibanLast4: string | null;
  bankId: string;
  bankName: string;
  bankColor: string;
  rule?: AppliedRule | null;
  linked?: LinkedTransaction[];
}): TxItem {
  const { tx } = row;
  return {
    id: tx.id,
    bookedAt: tx.bookedAt,
    descriptionRaw: tx.descriptionRaw,
    merchant: tx.merchant,
    amountCents: tx.amountCents,
    currency: tx.currency,
    balanceAfterCents: tx.balanceAfterCents,
    account: { name: row.accountName, bankId: row.bankId, bankName: row.bankName, bankColor: row.bankColor, ibanLast4: row.ibanLast4 },
    categoryId: tx.categoryId,
    categorizedBy: tx.categorizedBy,
    categoryConfidence: tx.categoryConfidence,
    flagged: tx.flagged,
    flagReason: tx.flagReason,
    transferGroupId: tx.transferGroupId,
    linked: row.linked ?? [],
    notes: tx.notes,
    statementId: tx.statementId,
    isConfirmed: tx.isConfirmed,
    excluded: tx.excludedAt !== null,
    rule: tx.categorizedBy === "rule" ? (row.rule ?? null) : null,
  };
}
