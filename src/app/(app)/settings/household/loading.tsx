import { useTranslations } from "next-intl";
import { LoadingPage } from "@/components/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function HouseholdLoading() {
  const t = useTranslations("settings");
  return (
    <LoadingPage>
      <Card>
        <CardHeader>
          <CardTitle>{t("household.title")}</CardTitle>
          <CardDescription>{t("household.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium">{t("household.name")}</p>
              <Skeleton className="h-9" />
            </div>
            <Skeleton className="h-9 w-20" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("household.members")}</p>
            <ul className="divide-y rounded-lg border">
              {[0, 1].map((i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium">{t("invite.label")}</p>
              <Skeleton className="h-9" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
        </CardContent>
      </Card>
    </LoadingPage>
  );
}
