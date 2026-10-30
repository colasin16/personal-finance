import { useTranslations } from "next-intl";
import { LoadingPage } from "@/components/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const WIDTHS = ["w-56", "w-40", "w-64", "w-48", "w-36", "w-52"];

export default function RulesLoading() {
  const t = useTranslations("settings");
  return (
    <LoadingPage>
      <Card>
        <CardHeader>
          <CardTitle>{t("rules.title")}</CardTitle>
          <CardDescription>{t("rules.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 min-w-48 flex-1" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-72 max-w-full" />
            <ul className="divide-y rounded-lg border bg-card">
              {WIDTHS.map((w, i) => (
                <li key={i} className="flex items-center gap-2 px-2 py-2.5">
                  <Skeleton className="size-4" />
                  <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <Skeleton className={`h-4 ${w} max-w-full`} />
                  <span className="flex-1" />
                  <Skeleton className="hidden h-6 w-24 rounded-md sm:block" />
                  <Skeleton className="hidden h-3 w-20 sm:block" />
                  <Skeleton className="h-5 w-8 rounded-full" />
                  <Skeleton className="size-7" />
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </LoadingPage>
  );
}
