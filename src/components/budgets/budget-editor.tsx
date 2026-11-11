"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { suggestBudget } from "@/lib/domain/budgets";
import { formatMoney, parseAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Money } from "@/components/money";
import { useAmountsVisibility } from "@/components/privacy/amounts-visibility";
import { CATEGORY_TEXT, CategoryIcon, categoryTint } from "@/components/transactions/category-label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";

export type BudgetCategory = {
  id: string;
  name: string;
  icon: string;
  color: string;
  budget: number;
  spent: number;
  count: number;
  lastMonthBudget: number;
  lastMonthSpent: number;
  averageSpent: number | null;
};

/** Below `md` the dialog becomes a bottom sheet, like the dashboard's view options. */
export const SHEET_ON_MOBILE =
  "max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom-8 max-md:data-closed:zoom-out-100 max-md:data-closed:slide-out-to-bottom-8";

/** Cents as typed in the amount field: "250" or "249,90" (decimal comma in Spanish). */
export function centsToInput(cents: number, locale: string) {
  const value = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  return locale === "es" ? value.replace(".", ",") : value;
}

/** A budget typed by the user, in cents; null when it isn't a positive amount. */
export function parseBudgetInput(value: string) {
  const cents = parseAmount(value);
  return cents !== null && cents > 0 ? cents : null;
}

export function CategoryBadge({ icon, color, className }: { icon: string | null; color: string; className?: string }) {
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg border", CATEGORY_TEXT, className)} style={categoryTint(color)}>
      <CategoryIcon icon={icon} className="size-4" />
    </span>
  );
}

export function BudgetEditor({
  category,
  monthLabel,
  averageMonths,
  transactionsHref,
  onOpenChange,
  onSave,
}: {
  category: BudgetCategory | null;
  monthLabel: string;
  averageMonths: number;
  transactionsHref: (categoryId: string) => string;
  onOpenChange: (open: boolean) => void;
  onSave: (category: BudgetCategory, amountCents: number, applyForward: boolean) => void;
}) {
  const t = useTranslations("budgets.editor");
  return (
    <Dialog open={category !== null} onOpenChange={onOpenChange}>
      <DialogContent className={cn("gap-5 sm:max-w-md", SHEET_ON_MOBILE)}>
        {category && (
          <>
            <DialogHeader className="flex-row items-center gap-3 pr-8">
              <CategoryBadge icon={category.icon} color={category.color} />
              <div className="min-w-0 space-y-0.5">
                <DialogTitle className="truncate">{t("title", { name: category.name })}</DialogTitle>
                <DialogDescription className="first-letter:uppercase">{t("description", { month: monthLabel })}</DialogDescription>
              </div>
            </DialogHeader>
            {/* Keyed so the form starts fresh for each category. */}
            <EditorForm key={category.id} category={category} monthLabel={monthLabel} averageMonths={averageMonths} transactionsHref={transactionsHref} onSave={onSave} onCancel={() => onOpenChange(false)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditorForm({
  category,
  monthLabel,
  averageMonths,
  transactionsHref,
  onSave,
  onCancel,
}: {
  category: BudgetCategory;
  monthLabel: string;
  averageMonths: number;
  transactionsHref: (categoryId: string) => string;
  onSave: (category: BudgetCategory, amountCents: number, applyForward: boolean) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("budgets.editor");
  const locale = useLocale();
  const { hidden } = useAmountsVisibility();
  const average = category.averageSpent !== null ? suggestBudget(category.averageSpent) : 0;
  const initial = category.budget || average || suggestBudget(category.lastMonthSpent);
  const [value, setValue] = useState(initial ? centsToInput(initial, locale) : "");
  const [applyForward, setApplyForward] = useState(true);
  const [invalid, setInvalid] = useState(false);

  const fills = [
    { key: "average", label: t("useAverage"), cents: average },
    { key: "lastSpent", label: t("useLastMonthSpent"), cents: suggestBudget(category.lastMonthSpent) },
    { key: "lastBudget", label: t("useLastMonthBudget"), cents: category.lastMonthBudget },
  ].filter((f, i, all) => f.cents > 0 && all.findIndex((o) => o.cents === f.cents) === i);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseBudgetInput(value);
    if (cents === null) return setInvalid(true);
    onSave(category, cents, applyForward);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-xs">
        <Stat label={t("spentThisMonth")} cents={category.spent} />
        <Stat label={t("lastMonth")} cents={category.lastMonthSpent} />
        {category.averageSpent !== null && <Stat label={t("average", { count: averageMonths })} cents={category.averageSpent} />}
      </dl>

      <div className="space-y-2">
        <Label htmlFor="budget-amount">{t("amount")}</Label>
        <InputGroup className="h-11 text-lg">
          <InputGroupInput
            id="budget-amount"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setInvalid(false);
            }}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? "budget-amount-error" : undefined}
            className="text-lg font-semibold tabular-nums md:text-lg"
            placeholder="0"
          />
          <InputGroupAddon align="inline-end">€</InputGroupAddon>
        </InputGroup>
        {invalid && (
          <p id="budget-amount-error" className="text-xs text-destructive">
            {t("invalidAmount")}
          </p>
        )}
        {fills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1" aria-label={t("suggestions")} role="group">
            {fills.map((f) => (
              <Button
                key={f.key}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 rounded-full px-2.5 text-xs font-normal"
                onClick={() => {
                  setValue(centsToInput(f.cents, locale));
                  setInvalid(false);
                }}
              >
                {f.label} · <span className="font-medium tabular-nums">{formatMoney(f.cents, "EUR", { whole: f.cents % 100 === 0, hidden })}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-start gap-3">
        <Checkbox id="budget-forward" checked={applyForward} onCheckedChange={(v) => setApplyForward(v === true)} className="mt-0.5" />
        <div className="space-y-0.5">
          <Label htmlFor="budget-forward" className="font-normal">
            {t("applyForward")}
          </Label>
          {!applyForward && <p className="text-xs text-muted-foreground">{t("applyForwardHint", { month: monthLabel })}</p>}
        </div>
      </div>

      {category.count > 0 && (
        <Link href={transactionsHref(category.id)} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          {t("viewTransactions")} <ArrowRight className="size-3" />
        </Link>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        {category.budget > 0 ? (
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive max-sm:order-last" onClick={() => onSave(category, 0, applyForward)}>
            {t("remove")}
          </Button>
        ) : (
          <span className="max-sm:hidden" />
        )}
        <div className="flex gap-2 max-sm:flex-col-reverse">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
            {t("save")}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function Stat({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd>
        <Money cents={cents} className="font-medium" />
      </dd>
    </div>
  );
}
