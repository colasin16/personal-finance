import { useTranslations } from "next-intl";
import { LoadingPage } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const BARS = ["70%", "45%", "92%", "30%", "60%"];

export default function BudgetsLoading() {
  const t = useTranslations("budgets");
  return (
    <LoadingPage>
      <PageHeader title={t("title")} description={t("description")}>
        <Skeleton className="h-9 w-56 rounded-lg" />
      </PageHeader>
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
            <div className="grid grid-cols-3 gap-3 border-t pt-4">
              {[t("summary.budgeted"), t("summary.spent"), t("summary.remaining")].map((label) => (
                <div key={label} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("list.title")}</CardTitle>
            <CardDescription>{t("list.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {BARS.map((w, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="h-2 rounded-full bg-muted/50">
                    <Skeleton className="h-full rounded-full" style={{ width: w }} />
                  </div>
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </LoadingPage>
  );
}
