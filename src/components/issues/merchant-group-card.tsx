"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ChevronDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { categorizeMerchantAction, dismissSuggestionAction } from "@/lib/actions/transactions";
import { FLAG_CODES, formatDate } from "@/lib/labels";
import { AccountRef, type AccountRefData } from "@/components/accounts/account-ref";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryPicker, type CategoryOption } from "@/components/transactions/category-picker";

export type UncategorizedRow = { id: string; bookedAt: string; amountCents: number; account: AccountRefData; reason: string | null; description: string };
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
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-base font-semibold" title={merchant}>
              {merchant}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <AlertTriangle aria-hidden />
                {reasonLabel}
              </Badge>
              <span>{tc("transactionsCount", { count: rows.length })}</span>
            </div>
          </div>
          <Money cents={totalCents} colored className="shrink-0 pt-0.5 text-lg font-semibold" />
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1 size-7 shrink-0 text-muted-foreground"
            aria-label={tc("actions.dismiss")}
            disabled={pending}
            onClick={() => start(async () => void (await dismissSuggestionAction(dismissKey)))}
          >
            <X />
          </Button>
        </div>
        <ul className="divide-y rounded-md border">
          {(expanded ? rows : rows.slice(0, 3)).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm" title={r.description}>
                  {r.description}
                </p>
                <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="shrink-0 tabular-nums">{formatDate(r.bookedAt, locale)}</span>
                  <span aria-hidden>·</span>
                  <AccountRef account={r.account} className="min-w-0" />
                </p>
              </div>
              <Money cents={r.amountCents} colored className="shrink-0 text-sm font-medium" />
            </li>
          ))}
        </ul>
        {rows.length > 3 && (
          <Button variant="link" size="sm" className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground" onClick={() => setExpanded(!expanded)}>
            {expanded ? tc("actions.showLess") : tc("actions.showMore", { count: rows.length - 3 })}
            <ChevronDown className={expanded ? "rotate-180" : undefined} />
          </Button>
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
