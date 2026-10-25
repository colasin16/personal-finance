import type { Metadata } from "next";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { categories, categoryRules, householdInvites } from "@/lib/db/schema";
import { getMembers } from "@/lib/households";
import { getCategories } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { serviceModes } from "@/lib/services/modes";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryDot } from "@/components/transactions/category-picker";
import { AddCategoryForm, DeleteRuleButton, HouseholdNameForm, InviteForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

const MATCH_LABEL = { merchant: "Merchant is", contains: "Contains", regex: "Matches" } as const;

export default async function SettingsPage() {
  const { db, user, household } = await requireContext();
  const [members, cats, rules, invites] = await Promise.all([
    getMembers(db, household.id),
    getCategories(db, household.id),
    db
      .select({ rule: categoryRules, categoryName: categories.name, categoryColor: categories.color })
      .from(categoryRules)
      .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
      .where(eq(categoryRules.householdId, household.id))
      .orderBy(desc(categoryRules.createdAt)),
    db
      .select()
      .from(householdInvites)
      .where(and(eq(householdInvites.householdId, household.id), isNull(householdInvites.acceptedAt), gt(householdInvites.expiresAt, new Date()))),
  ]);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Household</CardTitle>
            <CardDescription>Everyone in the household sees shared accounts and non-private personal accounts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <HouseholdNameForm name={household.name} />
            <div className="space-y-2">
              <p className="text-sm font-medium">Members</p>
              <ul className="divide-y rounded-lg border">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>
                      {m.displayName} {m.id === user.id && <span className="text-muted-foreground">(you)</span>}
                      <span className="block text-xs text-muted-foreground">{m.email}</span>
                    </span>
                    <Badge variant="secondary">{m.role}</Badge>
                  </li>
                ))}
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground">
                    <span>{i.email}</span>
                    <Badge variant="outline">invited</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <InviteForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rules</CardTitle>
            <CardDescription>Applied first to every new statement. Create them from any transaction or from the Issues inbox.</CardDescription>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rules yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {rules.map(({ rule, categoryName, categoryColor }) => (
                  <li key={rule.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-muted-foreground">{MATCH_LABEL[rule.matchType]}</span> <span className="font-medium">“{rule.pattern}”</span>
                    </span>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <CategoryDot color={categoryColor} /> {categoryName}
                    </span>
                    <span className="w-16 text-right text-xs text-muted-foreground">{rule.hits} hits</span>
                    <DeleteRuleButton ruleId={rule.id} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Shared by everyone in the household.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(["expense", "income", "transfer"] as const).map((kind) => (
              <div key={kind}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">{kind}</p>
                <div className="flex flex-wrap gap-1.5">
                  {cats
                    .filter((c) => c.kind === kind)
                    .map((c) => (
                      <Badge key={c.id} variant="outline" className="gap-1.5 font-normal">
                        <CategoryDot color={c.color} /> {c.name}
                      </Badge>
                    ))}
                </div>
              </div>
            ))}
            <AddCategoryForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
            <CardDescription>Services and credits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-1.5">
              {serviceModes().map((m) => (
                <li key={m.service} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{m.service}</span>
                  <span className="text-right">
                    {m.value} {m.mocked && <Badge variant="outline" className="ml-1 text-amber-700 dark:text-amber-400">mock</Badge>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Charts by{" "}
              <a className="underline" href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
                TradingView
              </a>{" "}
              Lightweight Charts™ (Apache-2.0). Copyright © 2025 TradingView, Inc.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
