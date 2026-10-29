export type ExtractedTransaction = {
  /** YYYY-MM-DD */
  date: string;
  valueDate: string | null;
  description: string;
  /** Signed decimal amount in the statement currency: negative = money out. */
  amount: number;
  balanceAfter: number | null;
};

export type ExtractedStatement = {
  periodStart: string | null;
  periodEnd: string | null;
  currency: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  transactions: ExtractedTransaction[];
};
