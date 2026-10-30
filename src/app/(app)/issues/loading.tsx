import { useTranslations } from "next-intl";
import { LoadingPage } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-4 w-full max-w-sm" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-32" />
      </CardContent>
    </Card>
  );
}

function MerchantGroupSkeleton() {
  return (
    <Card className="py-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="size-7" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between gap-3">
            <Skeleton className={`h-3 ${["w-3/4", "w-2/3", "w-4/5"][i]}`} />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
        <Skeleton className="h-3 w-20" />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-44" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function IssuesLoading() {
  const t = useTranslations("issues");
  return (
    <LoadingPage>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-8">
        <section className="grid gap-4 md:grid-cols-2">
          <SummaryCardSkeleton />
          <SummaryCardSkeleton />
        </section>
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">{t("merchants.title")}</h2>
            <Skeleton className="mt-1 h-4 w-80 max-w-full" />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <MerchantGroupSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    </LoadingPage>
  );
}
