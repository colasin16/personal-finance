import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, CircleCheck, FileText, TriangleAlert } from "lucide-react";
import { statements } from "@/lib/db/schema";
import { describeIssue } from "@/lib/domain/validation";
import { formatDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { getCategories, getVisibleAccounts, listTransactions } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/statements/status-badge";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { toTxItem } from "@/components/transactions/tx-item";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmStatementButton } from "./confirm-button";

export const metadata: Metadata = { title: "Review statement" };

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { db, user, household } = await requireContext();
  const [statement] = await db
    .select()
    .from(statements)
    .where(and(eq(statements.id, id), eq(statements.householdId, household.id)));
  const accounts = await getVisibleAccounts(db, household.id, user.id, { includeArchived: true });
  const account = accounts.find((a) => a.id === statement?.accountId);
  if (!statement || !account) notFound();

  const [cats, { rows }] = await Promise.all([
    getCategories(db, household.id),
    listTransactions(db, household.id, [account.id], { statementId: statement.id, pageSize: 2000 }),
  ]);
  const all = rows;
  // Flagged rows first (Summ-style "needs your attention"), then chronological.
  const ordered = [...all].sort(
    (a, b) => Number(b.tx.flagged) - Number(a.tx.flagged) || a.tx.bookedAt.localeCompare(b.tx.bookedAt) || a.tx.position - b.tx.position,
  );
  const flagged = all.filter((r) => r.tx.flagged).length;
  const income = all.filter((r) => r.tx.amountCents > 0).reduce((s, r) => s + r.tx.amountCents, 0);
  const spending = all.filter((r) => r.tx.amountCents < 0).reduce((s, r) => s + r.tx.amountCents, 0);
  const fmt = (c: number) => formatMoney(c, statement.currency ?? account.currency);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/import">
          <ArrowLeft /> Import
        </Link>
      </Button>
      <PageHeader
        title={`${account.name} · ${statement.periodStart ? formatDate(statement.periodStart) : "?"} – ${statement.periodEnd ? formatDate(statement.periodEnd) : "?"}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {statement.fileName} <StatusBadge status={statement.status} progress={statement.progress} />
            {statement.detected?.provider && <span className="text-xs">parsed by {statement.detected.provider}</span>}
          </span>
        }
      >
        <Button asChild variant="outline">
          <a href={`/api/statements/${statement.id}/file`} target="_blank" rel="noreferrer">
            <FileText /> Open PDF
          </a>
        </Button>
        {statement.status === "needs_review" && <ConfirmStatementButton statementId={statement.id} flagged={flagged} />}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Opening balance", cents: statement.openingBalanceCents },
          { label: "Money in", cents: income },
          { label: "Money out", cents: spending },
          { label: "Closing balance", cents: statement.closingBalanceCents },
        ].map((k) => (
          <Card key={k.label} className="py-0">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-lg font-semibold">{k.cents === null ? "—" : <Money cents={k.cents} currency={statement.currency ?? account.currency} />}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {statement.issues.length === 0 ? (
        <Alert className="mb-6 border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CircleCheck className="text-emerald-600" />
          <AlertTitle>Balances check out</AlertTitle>
          <AlertDescription className="text-emerald-800 dark:text-emerald-300">
            Opening balance + {all.length} transactions = closing balance. Every transaction was read correctly.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="mb-6 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="text-amber-600" />
          <AlertTitle>Some numbers don&apos;t add up</AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-300">
            <ul className="list-disc pl-4">
              {statement.issues.map((issue, i) => (
                <li key={i}>{describeIssue(issue, fmt)}</li>
              ))}
            </ul>
            Compare with the PDF — a transaction may be missing or misread. You can reprocess the file from the Import page.
          </AlertDescription>
        </Alert>
      )}

      {flagged > 0 && (
        <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
          {flagged} transaction{flagged > 1 ? "s" : ""} need{flagged > 1 ? "" : "s"} a category — they&apos;re listed first.
        </p>
      )}
      <TransactionTable
        rows={ordered.map(toTxItem)}
        categories={cats.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }))}
        showAccount={false}
        showBalance
        emptyMessage="This statement has no transactions."
      />
    </>
  );
}
