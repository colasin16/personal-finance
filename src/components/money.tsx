"use client";

import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useAmountsVisibility } from "@/components/privacy/amounts-visibility";

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
  const { hidden } = useAmountsVisibility();
  const t = useTranslations("common.privacy");
  return (
    <span
      className={cn("tabular-nums", colored && cents > 0 && "text-emerald-600", colored && cents < 0 && "text-foreground", className)}
      aria-label={hidden ? t("hiddenAmount") : undefined}
    >
      {formatMoney(cents, currency, { signed, hidden })}
    </span>
  );
}
