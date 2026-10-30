import { useTranslations } from "next-intl";
import { LoadingPage } from "@/components/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AboutLoading() {
  const t = useTranslations("settings");
  return (
    <LoadingPage>
      <Card>
        <CardHeader>
          <CardTitle>{t("about.title")}</CardTitle>
          <CardDescription>{t("about.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex justify-between gap-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
              </li>
            ))}
          </ul>
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardContent>
      </Card>
    </LoadingPage>
  );
}
