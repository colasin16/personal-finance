import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoadingPage } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function AccountCardSkeleton() {
  return (
    <Card className="relative overflow-hidden py-0">
      <Skeleton className="absolute inset-y-0 left-0 w-1 rounded-none" />
      <CardContent className="space-y-3 p-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="size-9 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="size-8" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-5 w-24 rounded-full" />
      </CardContent>
    </Card>
  );
}

export default function AccountsLoading() {
  const t = useTranslations("accounts");
  return (
    <LoadingPage>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-8">
        {[3, 2].map((count, s) => (
          <section key={s} className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: count }, (_, i) => (
                <AccountCardSkeleton key={i} />
              ))}
            </div>
          </section>
        ))}
        <Button variant="outline" disabled>
          <Plus /> {t("addAccount")}
        </Button>
      </div>
    </LoadingPage>
  );
}
