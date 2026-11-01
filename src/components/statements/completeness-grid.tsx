import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { CompletenessCell } from "@/lib/queries";
import { formatMonth } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { AccountRef, type AccountRefData } from "@/components/accounts/account-ref";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const CELL: Record<CompletenessCell["status"], string> = {
  confirmed: "bg-emerald-500",
  needs_review: "bg-violet-400",
  processing: "bg-sky-300 animate-pulse",
  failed: "bg-red-400",
  missing: "bg-amber-100 ring-1 ring-inset ring-amber-400 dark:bg-amber-950/60 dark:ring-amber-700",
  none: "bg-muted",
};

const monthHref = (month: string) => `/import?month=${month}`;

/** Accounts × months — makes gaps in imported statements obvious at a glance. Clicking a month shows its statements. */
export function CompletenessGrid({
  months,
  grid,
  selectedMonth,
}: {
  months: string[];
  grid: { account: AccountRefData & { id: string }; cells: CompletenessCell[] }[];
  selectedMonth?: string;
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
                <th key={m} className="min-w-8 p-0 font-normal">
                  <Link
                    href={monthHref(m)}
                    scroll={false}
                    aria-current={m === selectedMonth ? "date" : undefined}
                    className={cn(
                      "block rounded px-1 py-0.5 hover:bg-muted hover:text-foreground",
                      m === selectedMonth ? "bg-foreground font-medium text-background hover:bg-foreground hover:text-background" : "text-muted-foreground",
                    )}
                  >
                    {formatMonth(m, "short", locale)}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map(({ account, cells }) => (
              <tr key={account.id}>
                <td className="max-w-52 pr-3 whitespace-nowrap">
                  <AccountRef account={account} size="md" />
                </td>
                {cells.map((cell) => {
                  const selected = cell.month === selectedMonth;
                  return (
                    <td key={cell.month}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={monthHref(cell.month)}
                            scroll={false}
                            aria-label={`${account.name} ${formatMonth(cell.month, "long", locale)}`}
                            className="block rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <div
                              className={cn(
                                "h-6 rounded transition-opacity hover:opacity-80",
                                CELL[cell.status],
                                selected && "ring-2 ring-foreground/60 ring-offset-1 ring-offset-background",
                              )}
                            />
                          </Link>
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
