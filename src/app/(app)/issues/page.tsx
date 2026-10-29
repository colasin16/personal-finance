import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, CalendarX, CircleCheckBig, FileQuestion, FileWarning, FileSearch } from "lucide-react";
import { getCategories, getIssues, merchantSuggestionKey, transferSuggestionKey } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { formatMonth } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountRef } from "@/components/accounts/account-ref";
import { MerchantGroupCard } from "@/components/issues/merchant-group-card";
import { TransferSuggestionCard } from "./suggestion-cards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("issues");
  return { title: t("title") };
}

export default async function IssuesPage() {
  const { db, user, household } = await requireContext();
  const [locale, t] = await Promise.all([getLocale(), getTranslations("issues")]);
  const [issues, cats] = await Promise.all([getIssues(db, household.id, user.id), getCategories(db, household.id, locale)]);
  const categories = cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, kind: c.kind }));

  const statementCards = [
    {
      key: "needs-account",
      items: issues.needsAccount,
      icon: FileQuestion,
      title: (n: number) => t("needsAccount.title", { count: n }),
      description: t("needsAccount.description"),
      href: "/import",
      cta: t("needsAccount.cta"),
    },
    {
      key: "failed",
      items: issues.failed,
      icon: FileWarning,
      title: (n: number) => t("failed.title", { count: n }),
      description: t("failed.description"),
      href: "/import",
      cta: t("failed.cta"),
    },
  ].filter((c) => c.items.length > 0);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {issues.total === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <CircleCheckBig className="size-12 text-emerald-600" />
            <p className="text-lg font-medium">{t("allClear")}</p>
            <p className="text-sm text-muted-foreground">{t("allClearDescription")}</p>
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
                      <FileSearch className="size-4 text-violet-600" /> {t("toReview.title", { count: issues.toReview.length })}
                    </CardTitle>
                    <CardDescription>{t("toReview.description")}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {issues.toReview.slice(0, 6).map((s) => (
                      <Button key={s.statement.id} asChild size="sm" variant="outline">
                        <Link href={`/statements/${s.statement.id}`}>
                          {s.accountName && s.bankId && s.bankName && s.bankColor ? (
                            <AccountRef
                              account={{ name: s.accountName, bankId: s.bankId, bankName: s.bankName, bankColor: s.bankColor, ibanLast4: s.ibanLast4 }}
                              className="max-w-48"
                            />
                          ) : (
                            s.statement.fileName
                          )}
                          {s.statement.periodStart && ` · ${formatMonth(s.statement.periodStart, "short", locale)}`}
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
                      <CalendarX className="size-4 text-amber-600" /> {t("gaps.title", { count: issues.gaps })}
                    </CardTitle>
                    <CardDescription>{t("gaps.description")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/import">
                        {t("gaps.cta")} <ArrowRight />
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
                <h2 className="font-semibold">{t("merchants.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("merchants.description", { count: issues.flaggedCount })}</p>
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
                      account: { name: r.accountName, bankId: r.bankId, bankName: r.bankName, bankColor: r.bankColor, ibanLast4: r.ibanLast4 },
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
                <h2 className="font-semibold">{t("transfers.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("transfers.description")}</p>
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
