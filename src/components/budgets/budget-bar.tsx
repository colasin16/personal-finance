import { budgetStatus, type BudgetStatus } from "@/lib/domain/budgets";
import { cn } from "@/lib/utils";

export const STATUS_BAR: Record<BudgetStatus, string> = {
  ok: "bg-emerald-500",
  near: "bg-amber-500",
  over: "bg-red-500",
};

export const STATUS_TEXT: Record<BudgetStatus, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  near: "text-amber-700 dark:text-amber-400",
  over: "text-red-600 dark:text-red-400",
};

/**
 * Spending against a budget, colored by status. `pace` (0–1, current month only) adds a tick where spending would
 * be today if it were spread evenly over the month.
 */
export function BudgetBar({
  spent,
  budget,
  pace,
  label,
  className,
}: {
  spent: number;
  budget: number;
  pace?: number | null;
  label: string;
  className?: string;
}) {
  const ratio = budget > 0 ? spent / budget : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(1, ratio) * 100)}
      aria-valuetext={`${Math.round(ratio * 100)}%`}
      className={cn("relative h-2 rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", STATUS_BAR[budgetStatus(spent, budget)])} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
      {pace != null && (
        <span aria-hidden className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground/60 ring-2 ring-background" style={{ left: `calc(${pace * 100}% - 1px)` }} />
      )}
    </div>
  );
}
