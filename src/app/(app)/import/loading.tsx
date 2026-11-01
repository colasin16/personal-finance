import { FileText, FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoadingPage } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ImportLoading() {
  const t = useTranslations("import");
  return (
    <LoadingPage>
      <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-muted-foreground/25 bg-background px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            <FileUp className="size-7" />
          </div>
          <div>
            <p className="text-lg font-medium">{t("dropzone.title")}</p>
            <p className="text-sm text-muted-foreground">{t("dropzone.hint")}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button tabIndex={-1} aria-disabled className="pointer-events-none bg-emerald-600">
              {t("dropzone.chooseFiles")}
            </Button>
            <Skeleton className="h-9 w-64" />
          </div>
        </div>

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle>{t("coverage.title")}</CardTitle>
            <CardDescription>{t("coverage.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 border-b py-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-44 shrink-0" />
                <div className="flex flex-1 gap-1 overflow-hidden">
                  {Array.from({ length: 12 }, (_, j) => (
                    <Skeleton key={j} className="h-6 min-w-8 flex-1 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
          <div className="flex items-center gap-3 border-b bg-muted/40 px-2 py-2">
            <Skeleton className="size-8" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="size-8" />
            <Skeleton className="h-3 w-36" />
          </div>
          <ul className="divide-y">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground/50" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className={`h-4 ${["w-64", "w-52", "w-72"][i]} max-w-full`} />
                    <Skeleton className="h-3 w-80 max-w-full" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="size-8" />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </LoadingPage>
  );
}
