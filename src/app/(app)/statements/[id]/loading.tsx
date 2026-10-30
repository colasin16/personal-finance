import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadingPage, PageHeaderSkeleton, StatCardSkeleton, TransactionTableSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function StatementLoading() {
  const t = useTranslations("statements");
  return (
    <LoadingPage>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/import">
          <ArrowLeft /> {t("backToImport")}
        </Link>
      </Button>
      <PageHeaderSkeleton actions={2} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton size="md" label={t("kpi.openingBalance")} />
        <StatCardSkeleton size="md" label={t("kpi.moneyIn")} />
        <StatCardSkeleton size="md" label={t("kpi.moneyOut")} />
        <StatCardSkeleton size="md" label={t("kpi.closingBalance")} />
      </div>
      <Skeleton className="mb-6 h-[62px] rounded-lg" />
      <TransactionTableSkeleton rows={10} showAccount={false} showBalance />
    </LoadingPage>
  );
}
