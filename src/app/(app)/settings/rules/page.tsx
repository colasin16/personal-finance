import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { categoryRules } from "@/lib/db/schema";
import { sortRules } from "@/lib/domain/rules";
import { getCategories } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RulesManager } from "@/components/rules/rules-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("rules.title")} · ${t("title")}` };
}

export default async function RulesSettingsPage() {
  const { db, household } = await requireContext();
  const locale = await getLocale();
  const t = await getTranslations("settings");
  const [rules, cats] = await Promise.all([
    db
      .select({
        id: categoryRules.id,
        matchType: categoryRules.matchType,
        pattern: categoryRules.pattern,
        categoryId: categoryRules.categoryId,
        priority: categoryRules.priority,
        enabled: categoryRules.enabled,
        hits: categoryRules.hits,
        lastMatchedAt: categoryRules.lastMatchedAt,
      })
      .from(categoryRules)
      .where(eq(categoryRules.householdId, household.id)),
    getCategories(db, household.id, locale),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("rules.title")}</CardTitle>
        <CardDescription>{t("rules.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <RulesManager rules={sortRules(rules)} categories={cats} />
      </CardContent>
    </Card>
  );
}
