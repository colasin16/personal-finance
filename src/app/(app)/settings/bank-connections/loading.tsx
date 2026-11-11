import { useTranslations } from "next-intl";
import { LoadingPage } from "@/components/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function BankConnectionsLoading() {
  const t = useTranslations("bankSync");
  return (
    <LoadingPage>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border">
            <div className="flex items-start gap-3 p-3">
              <Skeleton className="size-8 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <Skeleton className="hidden h-7 w-28 sm:block" />
            </div>
            {[0, 1].map((i) => (
              <div key={i} className="flex justify-between gap-3 border-t px-3 py-2.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
          <Skeleton className="h-8 w-36" />
        </CardContent>
      </Card>
    </LoadingPage>
  );
}
