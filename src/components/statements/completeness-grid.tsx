import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { CompletenessCell } from "@/lib/queries";
import { formatMonth } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { BankLogo } from "@/components/brand/bank-logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const CELL: Record<CompletenessCell["status"], string> = {
  confirmed: "bg-emerald-500",
  needs_review: "bg-violet-400",
  processing: "bg-sky-300 animate-pulse",
  failed: "bg-red-400",
  missing: "bg-amber-100 ring-1 ring-inset ring-amber-400 dark:bg-amber-950/60 dark:ring-amber-700",
  none: "bg-muted",
};

/** Accounts × months — makes gaps in imported statements obvious at a glance. */
export function CompletenessGrid({
  months,
  grid,
}: {
  months: string[];
  grid: { account: { id: string; name: string; bankId: string; bankName: string; bankColor: string }; cells: CompletenessCell[] }[];
}) {
  const t = useTranslations("import.coverage");
  const locale = useLocale();
  if (grid.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th />
              {months.map((m) => (
                <th key={m} className="min-w-8 font-normal text-muted-foreground">
                  {formatMonth(m, "short", locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map(({ account, cells }) => (
              <tr key={account.id}>
                <td className="max-w-44 pr-3 text-sm whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <BankLogo bankId={account.bankId} name={account.bankName} color={account.bankColor} size={20} className="rounded-[22%]" />
                    <span className="truncate">{account.name}</span>
                  </div>
                </td>
                {cells.map((cell) => {
                  const box = <div className={cn("h-6 rounded", CELL[cell.status])} />;
                  return (
                    <td key={cell.month}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {cell.statementId ? (
                            <Link href={`/statements/${cell.statementId}`} aria-label={`${account.name} ${formatMonth(cell.month, "long", locale)}`}>
                              {box}
                            </Link>
                          ) : (
                            box
                          )}
                        </TooltipTrigger>
                        <TooltipContent>
                          {account.name} · {formatMonth(cell.month, "long", locale)}: {t(`status.${cell.status}`)}
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {(["confirmed", "needs_review", "missing", "failed"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded", CELL[s])} /> {t(`status.${s}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
