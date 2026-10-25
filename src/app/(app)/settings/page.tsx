import type { Metadata } from "next";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { categories, categoryRules, householdInvites } from "@/lib/db/schema";
import { getMembers } from "@/lib/households";
import { localizeCategoryName } from "@/lib/i18n/categories";
import { getCategories } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { serviceModes } from "@/lib/services/modes";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryDot } from "@/components/transactions/category-picker";
import { AddCategoryForm, DeleteRuleButton, HouseholdNameForm, InviteForm } from "./settings-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const { db, user, household } = await requireContext();
  const locale = await getLocale();
  const t = await getTranslations("settings");
  const [members, cats, rules, invites] = await Promise.all([
    getMembers(db, household.id),
    getCategories(db, household.id, locale),
    db
      .select({ rule: categoryRules, categoryName: categories.name, categorySlug: categories.slug, categoryColor: categories.color })
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
      <PageHeader title={t("title")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("household.title")}</CardTitle>
            <CardDescription>{t("household.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <HouseholdNameForm name={household.name} />
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("household.members")}</p>
              <ul className="divide-y rounded-lg border">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>
                      {m.displayName} {m.id === user.id && <span className="text-muted-foreground">{t("household.you")}</span>}
                      <span className="block text-xs text-muted-foreground">{m.email}</span>
                    </span>
                    <Badge variant="secondary">{t(`household.roles.${m.role}`)}</Badge>
                  </li>
                ))}
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground">
                    <span>{i.email}</span>
                    <Badge variant="outline">{t("household.invited")}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <InviteForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("rules.title")}</CardTitle>
            <CardDescription>{t("rules.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("rules.empty")}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {rules.map(({ rule, categoryName, categorySlug, categoryColor }) => (
                  <li key={rule.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-muted-foreground">{t(`rules.match.${rule.matchType}`)}</span> <span className="font-medium">“{rule.pattern}”</span>
                    </span>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <CategoryDot color={categoryColor} /> {localizeCategoryName({ slug: categorySlug, name: categoryName }, locale)}
                    </span>
                    <span className="w-16 text-right text-xs text-muted-foreground">{t("rules.hits", { count: rule.hits })}</span>
                    <DeleteRuleButton ruleId={rule.id} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("categories.title")}</CardTitle>
            <CardDescription>{t("categories.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(["expense", "income", "transfer"] as const).map((kind) => (
              <div key={kind}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">{t(`categories.kinds.${kind}`)}</p>
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
            <CardTitle>{t("about.title")}</CardTitle>
            <CardDescription>{t("about.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-1.5">
              {serviceModes().map((m) => (
                <li key={m.key} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t(`services.labels.${m.key}`)}</span>
                  <span className="text-right">
                    {t(`services.values.${m.value}`)}
                    {m.detail && ` (${m.detail})`}{" "}
                    {m.mocked && (
                      <Badge variant="outline" className="ml-1 text-amber-700 dark:text-amber-400">
                        {t("services.mock")}
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              {t.rich("about.credits", {
                link: (c) => (
                  <a className="underline" href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
                    {c}
                  </a>
                ),
              })}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
