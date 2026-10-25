import Link from "next/link";
import type { CompletenessCell } from "@/lib/queries";
import { formatMonth } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const CELL: Record<CompletenessCell["status"], { className: string; label: string }> = {
  confirmed: { className: "bg-emerald-500", label: "Confirmed" },
  needs_review: { className: "bg-violet-400", label: "Ready to review" },
  processing: { className: "bg-sky-300 animate-pulse", label: "Processing" },
  failed: { className: "bg-red-400", label: "Needs attention" },
  missing: { className: "bg-amber-100 ring-1 ring-inset ring-amber-400", label: "Missing statement" },
  none: { className: "bg-muted", label: "Not tracked yet" },
};

/** Accounts × months — makes gaps in imported statements obvious at a glance. */
export function CompletenessGrid({
  months,
  grid,
}: {
  months: string[];
  grid: { account: { id: string; name: string; bankColor: string }; cells: CompletenessCell[] }[];
}) {
  if (grid.length === 0) return <p className="text-sm text-muted-foreground">Add an account to start tracking statements.</p>;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th />
              {months.map((m) => (
                <th key={m} className="min-w-8 font-normal text-muted-foreground">
                  {formatMonth(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map(({ account, cells }) => (
              <tr key={account.id}>
                <td className="max-w-44 truncate pr-3 text-sm whitespace-nowrap">
                  <span className="mr-2 inline-block size-2 rounded-full" style={{ background: account.bankColor }} />
                  {account.name}
                </td>
                {cells.map((cell) => {
                  const box = <div className={cn("h-6 rounded", CELL[cell.status].className)} />;
                  return (
                    <td key={cell.month}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {cell.statementId ? (
                            <Link href={`/statements/${cell.statementId}`} aria-label={`${account.name} ${cell.month}`}>
                              {box}
                            </Link>
                          ) : (
                            box
                          )}
                        </TooltipTrigger>
                        <TooltipContent>
                          {account.name} · {formatMonth(cell.month, "long")}: {CELL[cell.status].label}
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
            <span className={cn("size-3 rounded", CELL[s].className)} /> {CELL[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}
