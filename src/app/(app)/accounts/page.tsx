import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { banks } from "@/lib/db/schema";
import { getMembers } from "@/lib/households";
import { getVisibleAccounts } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { PageHeader } from "@/components/page-header";
import { AccountsView } from "./accounts-view";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const { db, user, household } = await requireContext();
  const [accounts, members, bankList] = await Promise.all([
    getVisibleAccounts(db, household.id, user.id, { includeArchived: true }),
    getMembers(db, household.id),
    db.select().from(banks).orderBy(asc(banks.name)),
  ]);
  const sortedBanks = [...bankList.filter((b) => b.id !== "other"), ...bankList.filter((b) => b.id === "other")];

  return (
    <>
      <PageHeader title="Accounts" description="All your bank accounts — personal and shared — in one place." />
      <AccountsView
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          bankId: a.bankId,
          bankName: a.bankName,
          bankColor: a.bankColor,
          ibanLast4: a.ibanLast4,
          type: a.type,
          isPrivate: a.isPrivate,
          isShared: a.isShared,
          archived: a.archivedAt !== null,
          owners: a.owners,
          balanceCents: a.balanceCents,
          balanceDate: a.balanceDate,
          currency: a.currency,
        }))}
        banks={sortedBanks.map(({ id, name, color, country }) => ({ id, name, color, country }))}
        members={members.map(({ id, displayName }) => ({ id, displayName }))}
        currentUserId={user.id}
      />
    </>
  );
}
