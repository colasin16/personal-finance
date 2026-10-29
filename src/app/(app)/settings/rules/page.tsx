import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { categories, categoryRules } from "@/lib/db/schema";
import { localizeCategoryName } from "@/lib/i18n/categories";
import { requireContext } from "@/lib/server/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryLabel } from "@/components/transactions/category-label";
import { DeleteRuleButton } from "../settings-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("rules.title")} · ${t("title")}` };
}

export default async function RulesSettingsPage() {
  const { db, household } = await requireContext();
  const locale = await getLocale();
  const t = await getTranslations("settings");
  const rules = await db
    .select({ rule: categoryRules, categoryName: categories.name, categorySlug: categories.slug, categoryColor: categories.color, categoryIcon: categories.icon })
    .from(categoryRules)
    .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
    .where(eq(categoryRules.householdId, household.id))
    .orderBy(desc(categoryRules.createdAt));

  return (
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
            {rules.map(({ rule, categoryName, categorySlug, categoryColor, categoryIcon }) => (
              <li key={rule.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-muted-foreground">{t(`rules.match.${rule.matchType}`)}</span> <span className="font-medium">“{rule.pattern}”</span>
                </span>
                <CategoryLabel name={localizeCategoryName({ slug: categorySlug, name: categoryName }, locale)} icon={categoryIcon} color={categoryColor} className="whitespace-nowrap" />
                <span className="w-16 text-right text-xs text-muted-foreground">{t("rules.hits", { count: rule.hits })}</span>
                <DeleteRuleButton ruleId={rule.id} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
