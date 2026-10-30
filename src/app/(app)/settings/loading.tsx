import { LoadingPage } from "@/components/skeletons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Fallback for settings sections; the settings layout (title + nav) renders around it. */
export default function SettingsLoading() {
  return (
    <LoadingPage>
      <Card>
        <CardHeader className="space-y-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9" />
          </div>
          <ul className="divide-y rounded-lg border">
            {["w-40", "w-32", "w-48"].map((w, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2.5">
                <div className="space-y-1.5">
                  <Skeleton className={`h-4 ${w}`} />
                  <Skeleton className="h-3 w-44" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </li>
            ))}
          </ul>
          <div className="flex items-end gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-28" />
          </div>
        </CardContent>
      </Card>
    </LoadingPage>
  );
}
