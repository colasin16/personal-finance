"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { suggestBudget } from "@/lib/domain/budgets";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useAmountsVisibility } from "@/components/privacy/amounts-visibility";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { CategoryBadge, centsToInput, parseBudgetInput, SHEET_ON_MOBILE, type BudgetCategory } from "./budget-editor";

/** Categories that would get a suggested budget: no budget yet and some spending in the previous months. */
export const suggestionCandidates = (categories: BudgetCategory[]) =>
  categories.filter((c) => c.budget === 0 && (c.averageSpent ?? 0) > 0).sort((a, b) => (b.averageSpent ?? 0) - (a.averageSpent ?? 0));

export function SuggestBudgetsDialog({
  open,
  onOpenChange,
  categories,
  averageMonths,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: BudgetCategory[];
  averageMonths: number;
  onApply: (changes: { category: BudgetCategory; amountCents: number }[]) => void;
}) {
  const t = useTranslations("budgets.suggest");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg", SHEET_ON_MOBILE)}>
        <DialogHeader className="pr-8">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { count: averageMonths })}</DialogDescription>
        </DialogHeader>
        {open && <SuggestForm categories={categories} onApply={onApply} />}
      </DialogContent>
    </Dialog>
  );
}

function SuggestForm({ categories, onApply }: { categories: BudgetCategory[]; onApply: (changes: { category: BudgetCategory; amountCents: number }[]) => void }) {
  const t = useTranslations("budgets.suggest");
  const locale = useLocale();
  const { hidden } = useAmountsVisibility();
  const [rows, setRows] = useState(() => categories.map((c) => ({ category: c, checked: true, value: centsToInput(suggestBudget(c.averageSpent ?? 0), locale) })));
  const selected = rows.flatMap((r) => {
    const amountCents = r.checked ? parseBudgetInput(r.value) : null;
    return amountCents === null ? [] : [{ category: r.category, amountCents }];
  });
  const update = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((all) => all.map((r) => (r.category.id === id ? { ...r, ...patch } : r)));

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected.length) onApply(selected);
      }}
    >
      <ul className="-mx-4 min-h-0 divide-y overflow-y-auto border-y px-4">
        {rows.map(({ category: c, checked, value }) => (
          <li key={c.id} className={cn("flex items-center gap-3 py-2.5", !checked && "opacity-60")}>
            <Checkbox id={`suggest-${c.id}`} checked={checked} onCheckedChange={(v) => update(c.id, { checked: v === true })} />
            <label htmlFor={`suggest-${c.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
              <CategoryBadge icon={c.icon} color={c.color} className="size-7" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">{t("average", { amount: formatMoney(c.averageSpent ?? 0, "EUR", { hidden }) })}</span>
              </span>
            </label>
            <InputGroup className="w-28 shrink-0">
              <InputGroupInput
                inputMode="decimal"
                autoComplete="off"
                aria-label={c.name}
                value={value}
                disabled={!checked}
                aria-invalid={checked && parseBudgetInput(value) === null ? true : undefined}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => update(c.id, { value: e.target.value })}
                className="text-right tabular-nums"
              />
              <InputGroupAddon align="inline-end">€</InputGroupAddon>
            </InputGroup>
          </li>
        ))}
      </ul>
      <DialogFooter>
        <Button type="submit" disabled={selected.length === 0} className="bg-emerald-600 hover:bg-emerald-700 max-sm:w-full">
          {t("apply", { count: selected.length })}
        </Button>
      </DialogFooter>
    </form>
  );
}
