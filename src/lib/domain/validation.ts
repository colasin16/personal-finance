export type StatementIssue =
  | { kind: "balance_mismatch"; expectedCents: number; actualCents: number }
  | { kind: "running_balance_mismatch"; rowIndex: number; expectedCents: number; actualCents: number }
  | { kind: "no_transactions" }
  | { kind: "missing_balances" };

export type ValidatableStatement = {
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
  transactions: { amountCents: number; balanceAfterCents: number | null }[];
};

export function validateStatement(statement: ValidatableStatement): StatementIssue[] {
  const issues: StatementIssue[] = [];
  const { openingBalanceCents: opening, closingBalanceCents: closing, transactions } = statement;

  if (transactions.length === 0) issues.push({ kind: "no_transactions" });

  if (opening === null || closing === null) {
    issues.push({ kind: "missing_balances" });
  } else {
    const sum = transactions.reduce((acc, t) => acc + t.amountCents, 0);
    if (opening + sum !== closing) {
      issues.push({ kind: "balance_mismatch", expectedCents: closing, actualCents: opening + sum });
    }
  }

  let running: number | null = opening;
  transactions.forEach((t, rowIndex) => {
    if (running === null) {
      running = t.balanceAfterCents;
      return;
    }
    running += t.amountCents;
    if (t.balanceAfterCents !== null && t.balanceAfterCents !== running) {
      issues.push({ kind: "running_balance_mismatch", rowIndex, expectedCents: t.balanceAfterCents, actualCents: running });
      running = t.balanceAfterCents;
    }
  });

  return issues;
}

/** Fills in missing running balances when an opening balance is known. */
export function fillRunningBalances<T extends { amountCents: number; balanceAfterCents: number | null }>(
  openingBalanceCents: number | null,
  rows: T[],
): T[] {
  let running = openingBalanceCents;
  return rows.map((row) => {
    if (row.balanceAfterCents !== null) {
      running = row.balanceAfterCents;
      return row;
    }
    if (running === null) return row;
    running += row.amountCents;
    return { ...row, balanceAfterCents: running };
  });
}

export function describeIssue(issue: StatementIssue, format: (cents: number) => string): string {
  switch (issue.kind) {
    case "balance_mismatch":
      return `Opening balance + movements = ${format(issue.actualCents)}, but the statement says ${format(issue.expectedCents)}.`;
    case "running_balance_mismatch":
      return `Row ${issue.rowIndex + 1}: running balance should be ${format(issue.actualCents)} but the statement shows ${format(issue.expectedCents)}.`;
    case "no_transactions":
      return "No transactions were found in this statement.";
    case "missing_balances":
      return "Opening or closing balance could not be read, so totals can't be verified.";
  }
}
