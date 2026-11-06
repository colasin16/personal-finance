"use client";

import { useTranslations } from "next-intl";
import { Flag, Sparkles } from "lucide-react";
import { FLAG_CODES } from "@/lib/labels";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TxItem } from "./tx-item";

const isFlagCode = (s: string): s is (typeof FLAG_CODES)[number] =>
  FLAG_CODES.includes(s as (typeof FLAG_CODES)[number]);

/** flag_reason holds a FLAG_CODES code (older rows may still hold raw English text). */
export function useFlagReason() {
  const tc = useTranslations("common");
  return (reason: string) =>
    isFlagCode(reason) ? tc(`flags.${reason}`) : reason;
}


/** Why a transaction needs attention, or how it was auto-categorized. */
export function SourceIcon({ tx }: { tx: TxItem }) {
  const t = useTranslations("transactions.table");
  const tc = useTranslations("common");
  const flagReason = useFlagReason();
  if (tx.flagged) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Flag
            className="size-3.5 shrink-0 text-amber-600"
            aria-label={t("needsAttention")}
          />
        </TooltipTrigger>
        <TooltipContent>
          {tx.flagReason ? flagReason(tx.flagReason) : t("checkCategory")}
        </TooltipContent>
      </Tooltip>
    );
  }
  if (
    tx.categorizedBy === "llm" ||
    tx.categorizedBy === "merchant" ||
    tx.categorizedBy === "rule"
  ) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Sparkles
            className="size-3.5 shrink-0 text-violet-500"
            aria-label={t("autoCategorized")}
          />
        </TooltipTrigger>
        <TooltipContent>
          {tc(`categorizedBy.${tx.categorizedBy}`)}
          {tx.categorizedBy === "llm" &&
            tx.categoryConfidence !== null &&
            ` · ${t("confidence", { percent: Math.round(tx.categoryConfidence * 100) })}`}
        </TooltipContent>
      </Tooltip>
    );
  }
  return null;
}

