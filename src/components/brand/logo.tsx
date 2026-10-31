import { WalletCards } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function Logo({ className, textClassName }: { className?: string; textClassName?: string }) {
  const t = useTranslations("common");
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
        <WalletCards className="size-4" />
      </span>
      <span className={textClassName}>{t("appName")}</span>
    </span>
  );
}
