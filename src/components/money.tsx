import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export function Money({
  cents,
  currency = "EUR",
  signed = false,
  colored = false,
  className,
}: {
  cents: number;
  currency?: string;
  signed?: boolean;
  colored?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", colored && cents > 0 && "text-emerald-600", colored && cents < 0 && "text-foreground", className)}>
      {formatMoney(cents, currency, { signed })}
    </span>
  );
}
