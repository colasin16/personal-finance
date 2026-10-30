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
      <div className="mb-3 flex h-5 items-center">
        <Skeleton className="h-4 w-56" />
      </div>
      <TransactionTableSkeleton rows={12} />
    </LoadingPage>
  );
}
