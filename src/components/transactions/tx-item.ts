export type TxItem = {
  id: string;
  bookedAt: string;
  descriptionRaw: string;
  merchant: string | null;
  amountCents: number;
  currency: string;
  balanceAfterCents: number | null;
  accountName: string;
  bankColor: string;
  categoryId: string | null;
  categorizedBy: string | null;
  categoryConfidence: number | null;
  flagged: boolean;
  flagReason: string | null;
  transferGroupId: string | null;
  notes: string | null;
  statementId: string | null;
  isConfirmed: boolean;
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
  };
  accountName: string;
  bankColor: string;
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
    accountName: row.accountName,
    bankColor: row.bankColor,
    categoryId: tx.categoryId,
    categorizedBy: tx.categorizedBy,
    categoryConfidence: tx.categoryConfidence,
    flagged: tx.flagged,
    flagReason: tx.flagReason,
    transferGroupId: tx.transferGroupId,
    notes: tx.notes,
    statementId: tx.statementId,
    isConfirmed: tx.isConfirmed,
  };
}
