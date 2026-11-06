"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  excludeTransactionsAction,
  restoreTransactionsAction,
  setCategoryAction,
  type RuleInput,
} from "@/lib/actions/transactions";
import { Button } from "@/components/ui/button";
import { CategoryPicker, type CategoryOption } from "./category-picker";
import { RuleDialog } from "./rule-dialog";
import { TransactionDetail } from "./transaction-detail";
import type { TxItem } from "./tx-item";

/**
 * State and actions shared by every transaction list view (table, mobile cards):
 * selection, optimistic category changes, remove/restore, the bulk action bar and the detail/rule dialogs.
 */
export function useTransactionList(rows: TxItem[], categories: CategoryOption[]) {
  const t = useTranslations("transactions.table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rule, setRule] = useState<Partial<RuleInput> | null>(null);
  const [detail, setDetail] = useState<TxItem | null>(null);
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    rows,
    (state, update: { ids: string[]; categoryId: string | null }) =>
      state.map((r) =>
        update.ids.includes(r.id)
          ? {
              ...r,
              categoryId: update.categoryId,
              categorizedBy: "user",
              flagged: false,
            }
          : r,
      ),
  );
  const catBy = new Map(categories.map((c) => [c.id, c]));

  const setCategory = (ids: string[], categoryId: string | null) =>
    start(async () => {
      setOptimistic({ ids, categoryId });
      const result = await setCategoryAction(ids, categoryId);
      if (!result.ok) return void toast.error(result.error);
      setSelected(new Set());
      const source = rows.find((r) => r.id === ids[0]);
      const merchant = source?.merchant;
      const category = categoryId ? catBy.get(categoryId) : null;
      if (ids.length === 1 && merchant && category) {
        toast.success(t("categorizedAs", { category: category.name }), {
          description: t("suggestRule", { merchant, category: category.name }),
          action: {
            label: t("createRule"),
            onClick: () =>
              setRule({
                matchType: "merchant",
                pattern: merchant,
                categoryId: category.id,
              }),
          },
          duration: 8000,
        });
      } else {
        toast.success(t("updated", { count: result.data.updated }));
      }
    });

  const setExcluded = (ids: string[], excluded: boolean) =>
    start(async () => {
      const result = await (excluded
        ? excludeTransactionsAction(ids)
        : restoreTransactionsAction(ids));
      if (!result.ok) return void toast.error(result.error);
      setSelected(new Set());
      setDetail(null);
      toast.success(
        t(excluded ? "removed" : "restored", { count: result.data.updated }),
      );
    });

  const allSelected =
    optimistic.length > 0 && optimistic.every((r) => selected.has(r.id));
  const allExcluded =
    selected.size > 0 &&
    optimistic.filter((r) => selected.has(r.id)).every((r) => r.excluded);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };
  const selectAll = (on: boolean) =>
    setSelected(on ? new Set(optimistic.map((r) => r.id)) : new Set());

  const bulkBar = selected.size > 0 && (
    <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-background p-2 pl-4 shadow-md">
      <span className="text-sm font-medium">
        {t("selected", { count: selected.size })}
      </span>
      <CategoryPicker
        categories={categories}
        value={null}
        onChange={(categoryId) => setCategory([...selected], categoryId)}
        placeholder={t("setCategory")}
        variant="outline"
        allowNone
        disabled={pending}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => setExcluded([...selected], !allExcluded)}
      >
        {allExcluded ? <RotateCcw /> : <Trash2 />}{" "}
        {allExcluded ? t("restore") : t("remove")}
      </Button>
      {pending && <Loader2 className="size-4 animate-spin" />}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        onClick={() => setSelected(new Set())}
      >
        <X /> {t("clear")}
      </Button>
    </div>
  );

  const dialogs = (
    <>
      {rule && (
        <RuleDialog
          open
          onOpenChange={(o) => !o && setRule(null)}
          categories={categories}
          initial={rule}
        />
      )}
      {detail && (
        <TransactionDetail
          tx={detail}
          category={
            detail.categoryId ? catBy.get(detail.categoryId) : undefined
          }
          categories={categories}
          onClose={() => setDetail(null)}
          onToggleExcluded={() => setExcluded([detail.id], !detail.excluded)}
          onCreateRule={() => {
            setRule({
              matchType: "merchant",
              pattern: detail.merchant ?? detail.descriptionRaw,
              categoryId: detail.categoryId ?? undefined,
            });
            setDetail(null);
          }}
        />
      )}
    </>
  );

  return {
    rows: optimistic,
    selected,
    allSelected,
    toggle,
    selectAll,
    setCategory,
    openDetail: setDetail,
    bulkBar,
    dialogs,
  };
}
