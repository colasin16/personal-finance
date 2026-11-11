"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, Landmark, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { syncBankNowAction } from "@/lib/actions/bank-sync";
import type { BankSyncStatusData } from "@/lib/bank-sync";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type { BankSyncStatusData };

/**
 * Bank sync freshness for pages built on synced data: "Bank data updated 3 hours ago · Sync now", plus a warning
 * when a bank's access expired or is about to. `problemsOnly` hides the freshness line (e.g. on the dashboard).
 */
export function BankSyncStatus({ status, problemsOnly = false, className }: { status: BankSyncStatusData; problemsOnly?: boolean; className?: string }) {
  const t = useTranslations("bankSync");
  const format = useFormatter();
  const router = useRouter();
  const [syncing, startSync] = useTransition();

  const syncNow = () =>
    startSync(async () => {
      let inserted = 0;
      for (const id of status.ownActiveIds) {
        const result = await syncBankNowAction(id);
        if (!result.ok) {
          toast.error(result.error);
          router.refresh();
          return;
        }
        inserted += result.data.inserted;
      }
      toast.success(t("synced", { count: inserted }));
      router.refresh();
    });

  const problems = [
    ...status.stale.map((s) => (s.since ? t("budgets.stale", { bank: s.bankName, when: format.relativeTime(s.since, status.now) }) : t("banner.expired", { bank: s.bankName }))),
    ...status.expiringSoon.map((s) => t("banner.expiring", { bank: s.bankName, days: s.days })),
  ];
  const showFreshness = !problemsOnly && (status.lastSyncedAt || status.ownActiveIds.length > 0);
  if (!showFreshness && problems.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {problems.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {problems.join(" ")}{" "}
            <Link href="/settings/bank-connections" className="font-medium underline-offset-4 hover:underline">
              {t("banner.action")}
            </Link>
          </span>
        </p>
      )}
      {showFreshness && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Landmark className="size-3.5" />
          <span>{status.lastSyncedAt ? t("budgets.updated", { when: format.relativeTime(status.lastSyncedAt, status.now) }) : t("budgets.notYet")}</span>
          {status.ownActiveIds.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <Button variant="link" size="sm" className="h-auto gap-1 p-0 text-xs" onClick={syncNow} disabled={syncing}>
                <RefreshCw className={cn("size-3", syncing && "animate-spin")} />
                {syncing ? t("syncing") : t("syncNow")}
              </Button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
