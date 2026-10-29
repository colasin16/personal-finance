"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { categorizeMerchantAction, dismissSuggestionAction } from "@/lib/actions/transactions";
import { FLAG_CODES, formatDate } from "@/lib/labels";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryPicker, type CategoryOption } from "@/components/transactions/category-picker";

export type UncategorizedRow = { id: string; bookedAt: string; amountCents: number; accountName: string; reason: string | null; description: string };
const isFlagCode = (s: string): s is (typeof FLAG_CODES)[number] => FLAG_CODES.includes(s as (typeof FLAG_CODES)[number]);

/** Issues inbox card: flagged transactions of one merchant, fixed with a single category choice. */
export function MerchantGroupCard({
  merchant,
  dismissKey,
  totalCents,
  rows,
  categories,
}: {
  merchant: string;
  dismissKey: string;
  totalCents: number;
  rows: UncategorizedRow[];
  categories: CategoryOption[];
}) {
  const t = useTranslations("issues.merchants");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [remember, setRemember] = useState(true);
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const choose = (categoryId: string | null) => {
    if (!categoryId) return;
    start(async () => {
      const result = await categorizeMerchantAction(
        rows.map((r) => r.id),
        merchant,
        categoryId,
        remember,
      );
      if (!result.ok) return void toast.error(result.error);
      toast.success(t(remember ? "categorizedWithRule" : "categorized", { count: rows.length }));
    });
  };

  // flag_reason holds a FLAG_CODES code; older rows may still hold raw English text.
  const reason = rows[0]?.reason;
  const reasonLabel = !reason ? t("lowConfidence") : isFlagCode(reason) ? tc(`flags.${reason}`) : reason;

  return (
    <Card className="py-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{merchant}</p>
            <p className="text-xs text-muted-foreground">
              {tc("transactionsCount", { count: rows.length })} · <Money cents={totalCents} /> · {reasonLabel}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={tc("actions.dismiss")}
            disabled={pending}
            onClick={() => start(async () => void (await dismissSuggestionAction(dismissKey)))}
          >
            <X />
          </Button>
        </div>
        {(expanded ? rows : rows.slice(0, 3)).map((r) => (
          <div key={r.id} className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              {formatDate(r.bookedAt, locale)} · {r.accountName} · {r.description}
            </span>
            <Money cents={r.amountCents} className="shrink-0" />
          </div>
        ))}
        {rows.length > 3 && (
          <button className="text-xs text-muted-foreground underline" onClick={() => setExpanded(!expanded)}>
            {expanded ? tc("actions.showLess") : tc("actions.showMore", { count: rows.length - 3 })}
          </button>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={remember} onCheckedChange={(c) => setRemember(c === true)} />
            {t("remember")}
          </label>
          <div className="flex items-center gap-2">
            {pending && <Loader2 className="size-4 animate-spin" />}
            <CategoryPicker categories={categories} value={null} onChange={choose} placeholder={t("chooseCategory")} variant="outline" disabled={pending} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
