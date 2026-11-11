"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, PiggyBank, Plus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setBudgetAction, setBudgetsAction } from "@/lib/actions/budgets";
import { budgetStatus } from "@/lib/domain/budgets";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Money } from "@/components/money";
import { useAmountsVisibility } from "@/components/privacy/amounts-visibility";
import { UNCATEGORIZED_COLOR } from "@/components/transactions/category-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetBar, STATUS_TEXT } from "./budget-bar";
import { BudgetEditor, CategoryBadge, type BudgetCategory } from "./budget-editor";
import { SuggestBudgetsDialog, suggestionCandidates } from "./suggest-dialog";

export type BudgetsViewData = {
  month: string;
  monthLabel: string;
  /** First and last day of the month, for links to its transactions. */
  range: { start: string; end: string };
  pace: { fraction: number; daysLeft: number } | null;
  /** Whether the month is over (so "on track" becomes "within budget"). */
  past: boolean;
  averageMonths: number;
  income: number;
  categories: BudgetCategory[];
  uncategorized: { cents: number; count: number };
  otherSpending: number;
};

type Change = { categoryId: string; amountCents: number };

export function BudgetsView({ data }: { data: BudgetsViewData }) {
  const t = useTranslations("budgets");
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<BudgetCategory | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  // Saved amounts show straight away while the page re-renders with the server's numbers.
  const [categories, applyOptimistic] = useOptimistic(data.categories, (state, changes: Change[]) =>
    state.map((c) => {
      const change = changes.find((x) => x.categoryId === c.id);
      return change ? { ...c, budget: change.amountCents } : c;
    }),
  );

  const save = (changes: Change[], applyForward: boolean, message: string) =>
    startTransition(async () => {
      applyOptimistic(changes);
      const result =
        changes.length === 1 ? await setBudgetAction({ month: data.month, ...changes[0]!, applyForward }) : await setBudgetsAction({ month: data.month, changes });
      if (result.ok) toast.success(message);
      else toast.error(result.error);
    });

  const { budgeted, unbudgeted, others } = useMemo(() => {
    const byName = (a: BudgetCategory, b: BudgetCategory) => a.name.localeCompare(b.name);
    return {
      budgeted: categories.filter((c) => c.budget > 0).sort((a, b) => b.budget - a.budget || byName(a, b)),
      unbudgeted: categories.filter((c) => c.budget === 0 && c.spent > 0).sort((a, b) => b.spent - a.spent || byName(a, b)),
      others: categories.filter((c) => c.budget === 0 && c.spent === 0).sort(byName),
    };
  }, [categories]);
  const candidates = suggestionCandidates(categories);
  const outside = unbudgeted.reduce((sum, c) => sum + c.spent, 0) + data.uncategorized.cents + data.otherSpending;
  const transactionsHref = (category: string) => `/transactions?${new URLSearchParams({ category, from: data.range.start, to: data.range.end })}`;

  return (
    <div className="space-y-6">
      {budgeted.length === 0 ? (
        <EmptyState canSuggest={candidates.length > 0} onSuggest={() => setSuggesting(true)} />
      ) : (
        <>
          <Summary data={data} budgeted={budgeted} outside={outside} />
          <Card>
            <CardHeader>
              <CardTitle>{t("list.title")}</CardTitle>
              <CardDescription>{t("list.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <ul className="-mx-3 space-y-1">
                {budgeted.map((c) => (
                  <li key={c.id}>
                    <BudgetRow category={c} pace={data.pace?.fraction} onEdit={() => setEditing(c)} />
                  </li>
                ))}
              </ul>
              {data.pace && <p className="pt-2 text-xs text-muted-foreground">{t("list.paceLegend")}</p>}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle>{t("unbudgeted.title")}</CardTitle>
            <CardDescription>{t("unbudgeted.description")}</CardDescription>
          </div>
          {budgeted.length > 0 && candidates.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setSuggesting(true)}>
              <Sparkles /> {t("suggest.button")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ul className="-mx-3">
            {unbudgeted.map((c) => (
              <li key={c.id}>
                <UnbudgetedRow category={c} onEdit={() => setEditing(c)} />
              </li>
            ))}
            {data.uncategorized.cents > 0 && (
              <li>
                <UncategorizedRow cents={data.uncategorized.cents} count={data.uncategorized.count} href={transactionsHref("none")} />
              </li>
            )}
          </ul>
          {unbudgeted.length === 0 && data.uncategorized.cents === 0 && <p className="text-sm text-muted-foreground">{t("unbudgeted.noSpending")}</p>}
          {others.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => setShowOthers((v) => !v)} aria-expanded={showOthers}>
                <ChevronDown className={cn("transition-transform", showOthers && "rotate-180")} />
                {showOthers ? t("unbudgeted.hideOthers") : t("unbudgeted.showOthers", { count: others.length })}
              </Button>
              {showOthers && (
                <ul className="-mx-3 mt-1">
                  {others.map((c) => (
                    <li key={c.id}>
                      <UnbudgetedRow category={c} onEdit={() => setEditing(c)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <BudgetEditor
        category={editing}
        monthLabel={data.monthLabel}
        averageMonths={data.averageMonths}
        transactionsHref={transactionsHref}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(category, amountCents, applyForward) => {
          setEditing(null);
          save([{ categoryId: category.id, amountCents }], applyForward, t(amountCents === 0 ? "editor.removed" : "editor.saved"));
        }}
      />
      <SuggestBudgetsDialog
        open={suggesting}
        onOpenChange={setSuggesting}
        categories={candidates}
        averageMonths={data.averageMonths}
        onApply={(changes) => {
          setSuggesting(false);
          save(
            changes.map((c) => ({ categoryId: c.category.id, amountCents: c.amountCents })),
            true,
            t("suggest.created", { count: changes.length }),
          );
        }}
      />
    </div>
  );
}

function EmptyState({ canSuggest, onSuggest }: { canSuggest: boolean; onSuggest: () => void }) {
  const t = useTranslations("budgets.empty");
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          <PiggyBank className="size-7" />
        </span>
        <div className="max-w-md space-y-1">
          <p className="text-lg font-medium">{t("title")}</p>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {canSuggest ? (
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onSuggest}>
            <Sparkles /> {t("suggest")}
          </Button>
        ) : (
          <p className="max-w-md text-xs text-muted-foreground">{t("noHistory")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Summary({ data, budgeted, outside }: { data: BudgetsViewData; budgeted: BudgetCategory[]; outside: number }) {
  const t = useTranslations("budgets.summary");
  const { hidden } = useAmountsVisibility();
  const money = (cents: number) => formatMoney(cents, "EUR", { hidden });
  const budget = budgeted.reduce((sum, c) => sum + c.budget, 0);
  const spent = budgeted.reduce((sum, c) => sum + c.spent, 0);
  const left = budget - spent;
  const status = budgetStatus(spent, budget);
  const pace = data.pace;
  // A little slack, so spending a few euros ahead of an even pace doesn't raise a warning.
  const ahead = pace !== null && spent > budget * pace.fraction + budget * 0.05;
  const verdict =
    status === "over"
      ? { text: t("overBudget"), tone: STATUS_TEXT.over }
      : ahead
        ? { text: t("aheadOfPace"), tone: STATUS_TEXT.near }
        : pace || data.past
          ? { text: t(data.past ? "withinBudget" : "onTrack"), tone: STATUS_TEXT.ok }
          : null;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className={cn("text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl", left < 0 && STATUS_TEXT.over)}>
              {left >= 0 ? t("left", { amount: money(left) }) : t("over", { amount: money(-left) })}
            </p>
            <p className="text-sm text-muted-foreground">{t("ofBudgeted", { amount: money(budget) })}</p>
          </div>
          {verdict && <span className={cn("text-sm font-medium", verdict.tone)}>{verdict.text}</span>}
        </div>
        <BudgetBar spent={spent} budget={budget} pace={pace?.fraction} label={t("title")} className="h-3" />
        {pace && left > 0 && (
          <p className="text-sm text-muted-foreground">{t("perDay", { amount: money(Math.floor(left / pace.daysLeft)), count: pace.daysLeft })}</p>
        )}
        <dl className="grid grid-cols-3 gap-3 border-t pt-4 text-sm">
          <Figure label={t("budgeted")} cents={budget} />
          <Figure label={t("spent")} cents={spent} />
          <Figure label={t("remaining")} cents={left} className={left < 0 ? STATUS_TEXT.over : undefined} />
        </dl>
        {(outside > 0 || data.income > 0) && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {outside > 0 && <span>{t("outside", { amount: money(outside) })}</span>}
            {data.income > 0 && <span>{t("income", { amount: money(data.income) })}</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Figure({ label, cents, className }: { label: string; cents: number; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd>
        <Money cents={cents} className={cn("font-semibold", className)} />
      </dd>
    </div>
  );
}

const ROW = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

function BudgetRow({ category: c, pace, onEdit }: { category: BudgetCategory; pace?: number; onEdit: () => void }) {
  const t = useTranslations("budgets.list");
  const { hidden } = useAmountsVisibility();
  const status = budgetStatus(c.spent, c.budget);
  const left = c.budget - c.spent;
  return (
    <button type="button" className={ROW} onClick={onEdit} aria-label={t("edit", { name: c.name })}>
      <CategoryBadge icon={c.icon} color={c.color} />
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{c.name}</span>
          <span className={cn("shrink-0 text-sm font-medium tabular-nums", STATUS_TEXT[status])}>
            {left >= 0 ? t("left", { amount: formatMoney(left, "EUR", { hidden }) }) : t("over", { amount: formatMoney(-left, "EUR", { hidden }) })}
          </span>
        </span>
        <BudgetBar spent={c.spent} budget={c.budget} pace={pace} label={c.name} />
        <span className="flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
          <span>{t("spentOf", { spent: formatMoney(c.spent, "EUR", { hidden }), budget: formatMoney(c.budget, "EUR", { hidden }) })}</span>
          <span>{Math.round((c.spent / c.budget) * 100)}%</span>
        </span>
      </span>
    </button>
  );
}

function UnbudgetedRow({ category: c, onEdit }: { category: BudgetCategory; onEdit: () => void }) {
  const t = useTranslations("budgets.unbudgeted");
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={cn(ROW, "min-w-0 flex-1")} onClick={onEdit}>
        <CategoryBadge icon={c.icon} color={c.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{c.name}</span>
          {c.count > 0 && <span className="block text-xs text-muted-foreground">{t("transactions", { count: c.count })}</span>}
        </span>
        {c.spent > 0 && <Money cents={c.spent} className="text-sm font-medium" />}
      </button>
      <Button variant="ghost" size="sm" className="mr-2 shrink-0 text-emerald-700 dark:text-emerald-400" onClick={onEdit} tabIndex={-1} aria-hidden>
        <Plus /> <span className="max-sm:sr-only">{t("setBudget")}</span>
      </Button>
    </div>
  );
}

function UncategorizedRow({ cents, count, href }: { cents: number; count: number; href: string }) {
  const t = useTranslations("budgets.unbudgeted");
  return (
    <div className="flex items-center gap-1">
      <Link href={href} className={cn(ROW, "min-w-0 flex-1")}>
        <CategoryBadge icon={null} color={UNCATEGORIZED_COLOR} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{t("uncategorized")}</span>
          <span className="block text-xs text-muted-foreground">{t("transactions", { count })}</span>
        </span>
        <Money cents={cents} className="text-sm font-medium" />
      </Link>
      <Button variant="ghost" size="sm" className="mr-2 shrink-0" asChild tabIndex={-1} aria-hidden>
        <Link href={href}>{t("categorize")}</Link>
      </Button>
    </div>
  );
}
