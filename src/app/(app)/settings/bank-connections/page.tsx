import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getBankConnections, getSetupProposals } from "@/lib/bank-sync";
import { isoDate } from "@/lib/domain/bank-sync";
import { translateError } from "@/i18n/errors";
import { getVisibleAccounts } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { getBankSyncProvider } from "@/lib/services/bank-sync";
import { toAccountRef } from "@/components/accounts/account-ref";
import { BankConnections } from "@/components/bank-sync/bank-connections";
import type { SetupData } from "@/components/bank-sync/setup-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const [t, ts] = await Promise.all([getTranslations("bankSync"), getTranslations("settings")]);
  return { title: `${t("title")} · ${ts("title")}` };
}

export default async function BankConnectionsPage({ searchParams }: { searchParams: Promise<{ setup?: string; error?: string }> }) {
  const { db, user, household } = await requireContext();
  const [t, te, params] = await Promise.all([getTranslations("bankSync"), getTranslations("errors"), searchParams]);
  const now = new Date();
  const [connections, accounts] = await Promise.all([getBankConnections(db, household.id, now), getVisibleAccounts(db, household.id, user.id)]);
  const colors = Object.fromEntries(accounts.map((a) => [a.bankId, a.bankColor]));
  const setups: Record<string, SetupData> = {};
  for (const c of connections) {
    if (c.createdBy === user.id && c.status === "active") setups[c.id] = await getSetupProposals(db, household.id, c, now);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <BankConnections
          connections={connections.map((c) => ({
            ...c,
            bankColor: colors[c.bankId] ?? "#64748b",
            accounts: c.accounts.map((a) => ({ id: a.id, name: a.name, ibanLast4: a.ibanLast4, accountId: a.accountId, syncFrom: a.syncFrom, lastBalanceCents: a.lastBalanceCents })),
          }))}
          accounts={accounts.map((a) => ({ id: a.id, ...toAccountRef(a) }))}
          setups={setups}
          userId={user.id}
          today={isoDate(now)}
          now={now}
          openSetupId={params.setup ?? null}
          error={params.error ? translateError(te, params.error) : null}
          mocked={getBankSyncProvider().id === "mock"}
        />
      </CardContent>
    </Card>
  );
}
