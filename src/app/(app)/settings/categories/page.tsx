import type { Metadata } from "next";
import { count, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { SYSTEM_CATEGORY_SLUGS } from "@/lib/categories";
import { categoryRules, transactions } from "@/lib/db/schema";
import { getCategories } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoriesManager } from "@/components/categories/categories-manager";
import { AddCategoryForm } from "../settings-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("categories.title")} · ${t("title")}` };
}

export default async function CategoriesSettingsPage() {
  const { db, household } = await requireContext();
  const locale = await getLocale();
  const t = await getTranslations("settings");
  const [cats, txCounts, ruleCounts] = await Promise.all([
    getCategories(db, household.id, locale),
    db
      .select({ categoryId: transactions.categoryId, n: count() })
      .from(transactions)
      .where(eq(transactions.householdId, household.id))
      .groupBy(transactions.categoryId),
    db
      .select({ categoryId: categoryRules.categoryId, n: count() })
      .from(categoryRules)
      .where(eq(categoryRules.householdId, household.id))
      .groupBy(categoryRules.categoryId),
  ]);
  const txBy = new Map(txCounts.map((r) => [r.categoryId, r.n]));
  const rulesBy = new Map(ruleCounts.map((r) => [r.categoryId, r.n]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("categories.title")}</CardTitle>
        <CardDescription>{t("categories.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CategoriesManager
          categories={cats.map((c) => ({
            id: c.id,
            name: c.name,
            icon: c.icon,
            color: c.color,
            kind: c.kind,
            system: SYSTEM_CATEGORY_SLUGS.has(c.slug),
            transactions: txBy.get(c.id) ?? 0,
            rules: rulesBy.get(c.id) ?? 0,
          }))}
        />
        <AddCategoryForm />
      </CardContent>
    </Card>
  );
}
