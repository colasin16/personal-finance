import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getCategories } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryLabel } from "@/components/transactions/category-label";
import { AddCategoryForm } from "../settings-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("categories.title")} · ${t("title")}` };
}

export default async function CategoriesSettingsPage() {
  const { db, household } = await requireContext();
  const locale = await getLocale();
  const t = await getTranslations("settings");
  const cats = await getCategories(db, household.id, locale);

  return (
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
                  <CategoryLabel key={c.id} name={c.name} icon={c.icon} color={c.color} />
                ))}
            </div>
          </div>
        ))}
        <AddCategoryForm />
      </CardContent>
    </Card>
  );
}
