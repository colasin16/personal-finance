import { WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
        <WalletCards className="size-4" />
      </span>
      Household Finance
    </span>
  );
}
