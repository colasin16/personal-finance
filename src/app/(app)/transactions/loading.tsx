import { useTranslations } from "next-intl";
import { LoadingPage, TransactionTableSkeleton } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function TransactionsLoading() {
  const t = useTranslations("transactions");
  return (
    <LoadingPage>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full sm:w-64" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="ml-auto h-8 w-72 max-w-full" />
      </div>
      <TransactionTableSkeleton rows={12} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="ml-auto h-8 w-72 max-w-full" />
      </div>
    </LoadingPage>
  );
}
