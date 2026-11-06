"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowLeftRight, StickyNote } from "lucide-react";
import { AccountRef } from "@/components/accounts/account-ref";
import { formatDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Money } from "@/components/money";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryPicker, type CategoryOption } from "./category-picker";
import { SourceIcon } from "./source-icon";
import { TransactionCards, type LoadMore } from "./transaction-card";
import { useTransactionList } from "./use-transaction-list";
import type { TxItem } from "./tx-item";

/** Transactions as a table from `md` up, and as a vertical list of cards on smaller screens. */
export function TransactionTable({
  rows,
  categories,
  showAccount = true,
  showBalance = false,
  emptyMessage,
  loadMore,
}: {
  rows: TxItem[];
  categories: CategoryOption[];
  showAccount?: boolean;
  showBalance?: boolean;
  emptyMessage?: string;
  /** Lets the mobile cards keep loading past `rows`; the desktop table stays paginated. */
  loadMore?: LoadMore;
}) {
  const t = useTranslations("transactions.table");
  const locale = useLocale();
  const list = useTransactionList(rows, categories);
  const { selected } = list;

  return (
    <div className="relative">
      {list.bulkBar}

      <div className="md:hidden">
        <TransactionCards
          list={list}
          categories={categories}
          showAccount={showAccount}
          showBalance={showBalance}
          emptyMessage={emptyMessage}
          loadMore={loadMore}
        />
      </div>

      <div className="hidden overflow-x-auto rounded-xl border bg-background md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={list.allSelected}
                  onCheckedChange={(c) => list.selectAll(c === true)}
                  aria-label={t("selectAll")}
                />
              </TableHead>
              <TableHead className="w-28">{t("date")}</TableHead>
              <TableHead>{t("description")}</TableHead>
              {showAccount && (
                <TableHead className="hidden lg:table-cell">
                  {t("account")}
                </TableHead>
              )}
              <TableHead className="w-52">{t("category")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
              {showBalance && (
                <TableHead className="hidden text-right md:table-cell">
                  {t("balance")}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-12 text-center text-muted-foreground"
                >
                  {emptyMessage ?? t("empty")}
                </TableCell>
              </TableRow>
            )}
            {list.rows.slice(0, list.serverCount).map((r) => (
              <TableRow
                key={r.id}
                data-state={selected.has(r.id) ? "selected" : undefined}
                className={cn(
                  r.flagged && "bg-amber-50/60 dark:bg-amber-950/20",
                  r.excluded && "opacity-60 line-through",
                )}
              >
                <TableCell>
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={(c) => list.toggle(r.id, c === true)}
                    aria-label={t("selectRow")}
                  />
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                  {formatDate(r.bookedAt, locale)}
                </TableCell>
                <TableCell className="max-w-0 w-full">
                  <button
                    className="block w-full min-w-0 text-left"
                    onClick={() => list.openDetail(r)}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">
                        {r.merchant || r.descriptionRaw}
                      </span>
                      {r.transferGroupId && (
                        <ArrowLeftRight
                          className="size-3.5 shrink-0 text-sky-600"
                          aria-label={t("linkedTransfer")}
                        />
                      )}
                      {r.notes && (
                        <StickyNote
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-label={t("hasNotes")}
                        />
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.descriptionRaw}
                    </span>
                  </button>
                </TableCell>
                {showAccount && (
                  <TableCell className="hidden max-w-56 whitespace-nowrap lg:table-cell">
                    <AccountRef account={r.account} />
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-1">
                    <CategoryPicker
                      categories={categories}
                      value={r.categoryId}
                      onChange={(id) => list.setCategory([r.id], id)}
                      allowNone
                    />
                    <SourceIcon tx={r} />
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium whitespace-nowrap">
                  <Money cents={r.amountCents} currency={r.currency} colored />
                </TableCell>
                {showBalance && (
                  <TableCell className="hidden text-right text-sm whitespace-nowrap text-muted-foreground md:table-cell">
                    {r.balanceAfterCents !== null && (
                      <Money
                        cents={r.balanceAfterCents}
                        currency={r.currency}
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {list.dialogs}
    </div>
  );
}
