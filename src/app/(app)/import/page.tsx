import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { asc } from "drizzle-orm";
import { banks } from "@/lib/db/schema";
import { getMembers } from "@/lib/households";
import { getCompleteness, getVisibleAccounts, listStatements } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { PageHeader } from "@/components/page-header";
import { toAccountRef } from "@/components/accounts/account-ref";
import { CompletenessGrid } from "@/components/statements/completeness-grid";
import { isMonthParam, monthSlots, shiftMonth } from "@/lib/statement-months";
import { ImportView } from "./import-view";

// Retrying or assigning a statement processes it in the same function after the response.
export const maxDuration = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("import");
  return { title: t("title") };
}

type StatementRowData = Awaited<ReturnType<typeof listStatements>>[number];

const toItem = ({ statement: s, accountName, ibanLast4, bankId, bankName, bankColor }: StatementRowData) => ({
  id: s.id,
  fileName: s.fileName,
  status: s.status,
  progress: s.progress,
  progressAt: s.progressAt.toISOString(),
  error: s.error,
  accountId: s.accountId,
  account: accountName && bankId && bankName && bankColor ? { name: accountName, bankId, bankName, bankColor, ibanLast4 } : null,
  periodStart: s.periodStart,
  periodEnd: s.periodEnd,
  issues: s.issues.length,
  detected: s.detected,
});

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const { db, user, household } = await requireContext();
  const [accounts, allAccounts] = await Promise.all([
    getVisibleAccounts(db, household.id, user.id),
    getVisibleAccounts(db, household.id, user.id, { includeArchived: true }),
  ]);
  const allIds = allAccounts.map((a) => a.id);
  const [attention, completeness, members, bankList] = await Promise.all([
    listStatements(db, household.id, user.id, allIds, { attention: true }),
    getCompleteness(db, household.id, accounts),
    getMembers(db, household.id),
    db.select().from(banks).orderBy(asc(banks.name)),
  ]);
  const latest = completeness.months.at(-1)!;
  const earliest = completeness.grid.reduce((min, g) => (g.firstMonth && g.firstMonth < min ? g.firstMonth : min), latest);
  const month = isMonthParam(params.month) ? params.month : latest;
  const monthRows = accounts.length ? await listStatements(db, household.id, user.id, allIds, { month }) : [];
  const { slots, others } = monthSlots(
    month,
    completeness.grid.map((g) => ({ id: g.account.id, firstMonth: g.firstMonth, ref: toAccountRef(g.account) })),
    monthRows.map(toItem),
  );
  const t = await getTranslations("import");

  return (
    <>
      <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
      <div className="space-y-6">
        <ImportView
          accounts={accounts.map((a) => ({ id: a.id, ...toAccountRef(a) }))}
          banks={bankList.map(({ id, name, color, country }) => ({ id, name, color, country }))}
          members={members.map(({ id, displayName }) => ({ id, displayName }))}
          currentUserId={user.id}
          attention={attention.map(toItem)}
          browser={
            accounts.length
              ? {
                  month,
                  prev: month > earliest ? shiftMonth(month, -1) : null,
                  next: month < latest ? shiftMonth(month, 1) : null,
                  slots: slots.map(({ account, statements, missing }) => ({ account: { id: account.id, ...account.ref }, statements, missing })),
                  others,
                }
              : null
          }
          coverage={
            <CompletenessGrid
              months={completeness.months}
              selectedMonth={month}
              grid={completeness.grid.map((g) => ({ account: { id: g.account.id, ...toAccountRef(g.account) }, cells: g.cells }))}
            />
          }
        />
      </div>
    </>
  );
}
