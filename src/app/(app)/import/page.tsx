import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { asc } from "drizzle-orm";
import { banks } from "@/lib/db/schema";
import { getMembers } from "@/lib/households";
import { getCompleteness, getVisibleAccounts, listStatements } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { pendingJobs } from "@/lib/services/jobs";
import { PageHeader } from "@/components/page-header";
import { CompletenessGrid } from "@/components/statements/completeness-grid";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportView } from "./import-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("import");
  return { title: t("title") };
}

export default async function ImportPage() {
  const { db, user, household } = await requireContext();
  const accounts = await getVisibleAccounts(db, household.id, user.id);
  const [statementRows, completeness, members, bankList] = await Promise.all([
    listStatements(db, household.id, user.id, accounts.map((a) => a.id)),
    getCompleteness(db, household.id, accounts),
    getMembers(db, household.id),
    db.select().from(banks).orderBy(asc(banks.name)),
  ]);
  const jobsRunning = pendingJobs() > 0;
  const t = await getTranslations("import");

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
      />
      <div className="space-y-6">
        <ImportView
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, bankName: a.bankName, bankColor: a.bankColor }))}
          banks={bankList.map(({ id, name, color, country }) => ({ id, name, color, country }))}
          members={members.map(({ id, displayName }) => ({ id, displayName }))}
          currentUserId={user.id}
          jobsRunning={jobsRunning}
          statements={statementRows.map(({ statement: s, accountName, bankName }) => ({
            id: s.id,
            fileName: s.fileName,
            status: s.status,
            progress: s.progress,
            error: s.error,
            accountName,
            bankName,
            periodStart: s.periodStart,
            periodEnd: s.periodEnd,
            issues: s.issues.length,
            detected: s.detected,
            createdAt: s.createdAt.toISOString(),
          }))}
        />
        <Card>
          <CardHeader>
            <CardTitle>{t("coverage.title")}</CardTitle>
            <CardDescription>{t("coverage.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <CompletenessGrid
              months={completeness.months}
              grid={completeness.grid.map((g) => ({ account: { id: g.account.id, name: g.account.name, bankId: g.account.bankId, bankName: g.account.bankName, bankColor: g.account.bankColor }, cells: g.cells }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
