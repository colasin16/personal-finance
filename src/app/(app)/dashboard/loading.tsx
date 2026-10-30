import { useTranslations } from "next-intl";
import { LoadingPage, StatCardSkeleton } from "@/components/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const BARS = ["h-40", "h-52", "h-36", "h-60", "h-44", "h-56"];
const CATEGORY_WIDTHS = ["85%", "62%", "48%", "33%", "21%"];

export default function DashboardLoading() {
  const t = useTranslations("dashboard");
  return (
    <LoadingPage>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <Skeleton className="mb-4 h-4 w-96 max-w-full" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton label={t("kpis.netWorth")} />
        <StatCardSkeleton label={t("kpis.income")} />
        <StatCardSkeleton label={t("kpis.spending")} />
        <StatCardSkeleton label={t("kpis.saved")} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("netWorth.title")}</CardTitle>
            <CardDescription>{t("netWorth.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-24" />
            </div>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("cashFlow.title")}</CardTitle>
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <div className="flex h-[300px] items-end gap-3 border-b pb-px">
              {BARS.map((h, i) => (
                <Skeleton key={i} className={`${h} flex-1 rounded-b-none`} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("ranking.title")}</CardTitle>
            <CardDescription>{t("ranking.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {CATEGORY_WIDTHS.map((w, i) => (
              <div key={i} className="space-y-1.5 rounded-lg border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-4 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/50">
                  <Skeleton className="h-full rounded-full" style={{ width: w }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("topMerchants.title")}</CardTitle>
            <CardDescription>{t("topMerchants.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {Array.from({ length: 8 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                  <Skeleton className={`h-4 ${["w-32", "w-24", "w-40", "w-28"][i % 4]}`} />
                  <span className="flex-1" />
                  <Skeleton className="h-3 w-6" />
                  <Skeleton className="h-4 w-16" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </LoadingPage>
  );
}
