import { useTranslations } from "next-intl";
import { LoadingPage } from "@/components/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SECTIONS = [
  { kind: "expense", rows: 18 },
  { kind: "income", rows: 2 },
  { kind: "transfer", rows: 2 },
] as const;
const WIDTHS = ["w-28", "w-24", "w-32", "w-20", "w-36"];

export default function CategoriesLoading() {
  const t = useTranslations("settings");
  return (
    <LoadingPage>
      <Card>
        <CardHeader>
          <CardTitle>{t("categories.title")}</CardTitle>
          <CardDescription>{t("categories.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-5">
            {SECTIONS.map(({ kind, rows }) => (
              <section key={kind}>
                <h3 className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">{t(`categories.kinds.${kind}`)}</h3>
                <ul className="grid gap-x-4 sm:grid-cols-2">
                  {Array.from({ length: rows }, (_, i) => (
                    <li key={i} className="flex h-10 items-center gap-2 border-b py-1.5">
                      <Skeleton className={`h-6 rounded-md ${WIDTHS[i % WIDTHS.length]}`} />
                      <span className="flex-1" />
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="size-7" />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">{t("categories.new")}</p>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="size-9" />
              <Skeleton className="h-9 w-40 flex-1" />
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-20" />
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="size-6 rounded-full" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </LoadingPage>
  );
}
