"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeftRight, Eye, StickyNote } from "lucide-react";
import { AccountRef } from "@/components/accounts/account-ref";
import { formatDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryPicker, type CategoryOption } from "./category-picker";
import { SourceIcon } from "./source-icon";
import { useTransactionList } from "./use-transaction-list";
import type { TxItem } from "./tx-item";

/**
 * One transaction as a card of label/value rows: the mobile alternative to a TransactionTable row.
 * Header holds the selection checkbox, the title and a single "view details" action.
 */
export function TransactionCard({
  tx,
  categories,
  selected,
  onSelectedChange,
  onCategoryChange,
  onView,
  showAccount = true,
  showBalance = false,
}: {
  tx: TxItem;
  categories: CategoryOption[];
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onCategoryChange: (categoryId: string | null) => void;
  onView: () => void;
  showAccount?: boolean;
  showBalance?: boolean;
}) {
  const t = useTranslations("transactions.table");
  const locale = useLocale();
  const title = tx.merchant || tx.descriptionRaw;

  return (
    <article
      data-state={selected ? "selected" : undefined}
      className={cn(
        "overflow-hidden rounded-xl border bg-background shadow-sm data-[state=selected]:border-primary/50 data-[state=selected]:bg-muted/40",
        tx.flagged && "bg-amber-50/60 dark:bg-amber-950/20",
      )}
    >
      <header className="flex items-center gap-3 border-b py-2 pr-2 pl-4">
        <Checkbox
          checked={selected}
          onCheckedChange={(c) => onSelectedChange(c === true)}
          aria-label={t("selectRow")}
        />
        <h3
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold",
            tx.excluded && "line-through opacity-60",
          )}
        >
          <span className="truncate" title={title}>
            {title}
          </span>
          {tx.transferGroupId && (
            <ArrowLeftRight
              className="size-3.5 shrink-0 text-sky-600"
              aria-label={t("linkedTransfer")}
            />
          )}
          {tx.notes && (
            <StickyNote
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label={t("hasNotes")}
            />
          )}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label={t("viewDetails")}
          title={t("viewDetails")}
          onClick={onView}
        >
          <Eye className="size-5" />
        </Button>
      </header>
      <dl
        className={cn(
          "divide-y px-4 text-sm",
          tx.excluded && "line-through opacity-60",
        )}
      >
        <Field label={t("date")}>{formatDate(tx.bookedAt, locale)}</Field>
        {tx.merchant && (
          <Field label={t("description")}>
            <span className="line-clamp-2 break-words text-muted-foreground">
              {tx.descriptionRaw}
            </span>
          </Field>
        )}
        {showAccount && (
          <Field label={t("account")}>
            <AccountRef account={tx.account} />
          </Field>
        )}
        <Field label={t("category")} className="py-1.5">
          <div className="-ml-2 flex min-w-0 items-center gap-1">
            <CategoryPicker
              categories={categories}
              value={tx.categoryId}
              onChange={onCategoryChange}
              allowNone
              className="min-w-0"
            />
            <SourceIcon tx={tx} />
          </div>
        </Field>
        <Field label={t("amount")}>
          <Money
            cents={tx.amountCents}
            currency={tx.currency}
            colored
            className="font-semibold tabular-nums"
          />
        </Field>
        {showBalance && tx.balanceAfterCents !== null && (
          <Field label={t("balance")}>
            <Money
              cents={tx.balanceAfterCents}
              currency={tx.currency}
              className="text-muted-foreground tabular-nums"
            />
          </Field>
        )}
      </dl>
    </article>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 py-2.5",
        className,
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

type TransactionList = ReturnType<typeof useTransactionList>;

/** Cards for an existing useTransactionList state; TransactionTable renders these on small screens. */
export function TransactionCards({
  list,
  categories,
  showAccount = true,
  showBalance = false,
  emptyMessage,
}: {
  list: TransactionList;
  categories: CategoryOption[];
  showAccount?: boolean;
  showBalance?: boolean;
  emptyMessage?: string;
}) {
  const t = useTranslations("transactions.table");
  if (list.rows.length === 0) {
    return (
      <p className="rounded-xl border bg-background py-12 text-center text-sm text-muted-foreground">
        {emptyMessage ?? t("empty")}
      </p>
    );
  }
  return (
    <>
      <label className="mb-3 flex w-fit items-center gap-3 pl-4 text-sm text-muted-foreground">
        <Checkbox
          checked={list.allSelected}
          onCheckedChange={(c) => list.selectAll(c === true)}
        />
        {t("selectAll")}
      </label>
      <ul className="space-y-3">
        {list.rows.map((r) => (
          <li key={r.id}>
            <TransactionCard
              tx={r}
              categories={categories}
              selected={list.selected.has(r.id)}
              onSelectedChange={(on) => list.toggle(r.id, on)}
              onCategoryChange={(id) => list.setCategory([r.id], id)}
              onView={() => list.openDetail(r)}
              showAccount={showAccount}
              showBalance={showBalance}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Standalone vertically scrolling card list with the same selection, bulk actions and dialogs as TransactionTable. */
export function TransactionCardList({
  rows,
  categories,
  ...props
}: {
  rows: TxItem[];
  categories: CategoryOption[];
  showAccount?: boolean;
  showBalance?: boolean;
  emptyMessage?: string;
}) {
  const list = useTransactionList(rows, categories);
  return (
    <div className="relative">
      {list.bulkBar}
      <TransactionCards list={list} categories={categories} {...props} />
      {list.dialogs}
    </div>
  );
}
