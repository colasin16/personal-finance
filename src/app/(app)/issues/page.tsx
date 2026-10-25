import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarX, CircleCheckBig, FileQuestion, FileWarning, FileSearch } from "lucide-react";
import { getCategories, getIssues, merchantSuggestionKey, transferSuggestionKey } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MerchantGroupCard, TransferSuggestionCard } from "./suggestion-cards";

export const metadata: Metadata = { title: "Issues" };

export default async function IssuesPage() {
  const { db, user, household } = await requireContext();
  const [issues, cats] = await Promise.all([getIssues(db, household.id, user.id), getCategories(db, household.id)]);
  const categories = cats.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }));

  const statementCards = [
    {
      key: "needs-account",
      items: issues.needsAccount,
      icon: FileQuestion,
      title: (n: number) => `${n} statement${n > 1 ? "s" : ""} from an unknown account`,
      description: "Tell us which account they belong to — we'll remember it for next month.",
      href: "/import",
      cta: "Assign accounts",
    },
    {
      key: "failed",
      items: issues.failed,
      icon: FileWarning,
      title: (n: number) => `${n} statement${n > 1 ? "s" : ""} couldn't be read`,
      description: "Usually a scanned PDF or a layout we don't know yet. Retry or upload the bank's digital PDF.",
      href: "/import",
      cta: "See details",
    },
  ].filter((c) => c.items.length > 0);

  return (
    <>
      <PageHeader title="Issues" description="Everything that needs a human decision. Fix one, and we learn for next time." />
      {issues.total === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <CircleCheckBig className="size-12 text-emerald-600" />
            <p className="text-lg font-medium">All clear</p>
            <p className="text-sm text-muted-foreground">Every statement is imported, categorized and reconciled.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {(statementCards.length > 0 || issues.toReview.length > 0 || issues.gaps > 0) && (
            <section className="grid gap-4 md:grid-cols-2">
              {statementCards.map((c) => (
                <Card key={c.key}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <c.icon className="size-4 text-amber-600" /> {c.title(c.items.length)}
                    </CardTitle>
                    <CardDescription>{c.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild size="sm" variant="outline">
                      <Link href={c.href}>
                        {c.cta} <ArrowRight />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {issues.toReview.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileSearch className="size-4 text-violet-600" /> {issues.toReview.length} statement{issues.toReview.length > 1 ? "s" : ""} ready to review
                    </CardTitle>
                    <CardDescription>Have a quick look and confirm — it takes seconds when everything adds up.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {issues.toReview.slice(0, 6).map((s) => (
                      <Button key={s.statement.id} asChild size="sm" variant="outline">
                        <Link href={`/statements/${s.statement.id}`}>
                          {s.accountName} · {s.statement.periodStart?.slice(0, 7)}
                        </Link>
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              )}
              {issues.gaps > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CalendarX className="size-4 text-amber-600" /> {issues.gaps} missing monthly statement{issues.gaps > 1 ? "s" : ""}
                    </CardTitle>
                    <CardDescription>Some months have no statement for an account, so totals for those months are incomplete.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/import">
                        View coverage <ArrowRight />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </section>
          )}

          {issues.merchantGroups.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="font-semibold">Uncategorized transactions</h2>
                <p className="text-sm text-muted-foreground">
                  {issues.flaggedCount} transactions we weren&apos;t sure about, grouped by merchant. One choice fixes them all.
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {issues.merchantGroups.slice(0, 30).map((g) => (
                  <MerchantGroupCard
                    key={g.merchant}
                    merchant={g.merchant}
                    dismissKey={merchantSuggestionKey(g.merchant)}
                    totalCents={g.totalCents}
                    categories={categories}
                    rows={g.rows.map((r) => ({
                      id: r.tx.id,
                      bookedAt: r.tx.bookedAt,
                      amountCents: r.tx.amountCents,
                      accountName: r.accountName,
                      reason: r.tx.flagReason,
                      description: r.tx.descriptionRaw,
                    }))}
                  />
                ))}
              </div>
            </section>
          )}

          {issues.transfers.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="font-semibold">Possible transfers between your accounts</h2>
                <p className="text-sm text-muted-foreground">Linked transfers are excluded from income and spending so nothing is counted twice.</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {issues.transfers.map((t) => (
                  <TransferSuggestionCard
                    key={`${t.outgoing.id}-${t.incoming.id}`}
                    dismissKey={transferSuggestionKey(t.outgoing.id, t.incoming.id)}
                    outgoing={{ id: t.outgoing.id, date: t.outgoing.bookedAt, account: t.outgoingAccount, description: t.outgoingDescription }}
                    incoming={{ id: t.incoming.id, date: t.incoming.bookedAt, account: t.incomingAccount, description: t.incomingDescription }}
                    amountCents={t.incoming.amountCents}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
