"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeftRight,
  ArrowUp,
  Eye,
  ListFilter,
  Loader2,
  RotateCcw,
  StickyNote,
} from "lucide-react";
import { AccountRef } from "@/components/accounts/account-ref";
import {
  loadMoreTransactionsAction,
  type TransactionListFilters,
} from "@/lib/actions/transactions";
import { formatDate } from "@/lib/labels";
import { intlLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryPicker, type CategoryOption } from "./category-picker";
import { activeFilterCount, useFiltersDialog } from "./filters-dialog-context";
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
        <h3 className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold", tx.excluded && "line-through opacity-60")}>
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
      <dl className={cn("divide-y px-4 text-sm", tx.excluded && "line-through opacity-60")}>
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

/** Where the next batch of an infinite card list comes from; omit for lists that are already complete. */
export type LoadMore = {
  filters: TransactionListFilters;
  /** Cursor after the last server-rendered row, or null when there is nothing more. */
  cursor: string | null;
  /** Rows left after the server-rendered ones. */
  remaining: number;
};

/** Consecutive rows booked in the same month, for the sticky month headers. */
function byMonth(rows: TxItem[]) {
  const groups: { month: string; rows: TxItem[] }[] = [];
  for (const r of rows) {
    const month = r.bookedAt.slice(0, 7);
    const last = groups.at(-1);
    if (last?.month === month) last.rows.push(r);
    else groups.push({ month, rows: [r] });
  }
  return groups;
}

/**
 * Cards for an existing useTransactionList state, grouped under sticky month headers; TransactionTable renders these
 * on small screens. With `loadMore`, the next batch loads automatically near the end of the list, with a button as
 * fallback (and for retrying after an error).
 */
export function TransactionCards({
  list,
  categories,
  showAccount = true,
  showBalance = false,
  emptyMessage,
  loadMore,
}: {
  list: TransactionList;
  categories: CategoryOption[];
  showAccount?: boolean;
  showBalance?: boolean;
  emptyMessage?: string;
  loadMore?: LoadMore;
}) {
  const t = useTranslations("transactions.table");
  const locale = useLocale();
  const filtersDialog = useFiltersDialog();
  if (list.rows.length === 0) {
    return (
      <p className="rounded-xl border bg-background py-12 text-center text-sm text-muted-foreground">
        {emptyMessage ?? t("empty")}
      </p>
    );
  }
  const monthFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const monthLabel = (month: string) => {
    const label = monthFormat.format(new Date(`${month}-01T00:00:00Z`));
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  };
  return (
    <>
      <label className="mb-1 flex w-fit items-center gap-3 pl-4 text-sm text-muted-foreground">
        <Checkbox
          checked={list.allSelected}
          onCheckedChange={(c) => list.selectAll(c === true)}
        />
        {t("selectAll")}
      </label>
      {byMonth(list.rows).map((g) => (
        <section key={g.month} aria-label={monthLabel(g.month)}>
          <div className="sticky top-14 z-[5] -mx-4 flex h-9 items-center justify-between gap-2 bg-background/90 px-4 backdrop-blur">
            <h2 className="text-sm font-semibold">{monthLabel(g.month)}</h2>
            {filtersDialog && (
              <MonthHeaderFilters onOpen={() => filtersDialog.setOpen(true)} />
            )}
          </div>
          <ul className="space-y-3 pb-2">
            {g.rows.map((r) => (
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
        </section>
      ))}
      {loadMore && <LoadMoreFooter list={list} loadMore={loadMore} />}
      {/* Room for the bottom selection bar, so it never covers the last card. */}
      {list.selected.size > 0 && <div aria-hidden className="h-28 md:hidden" />}
    </>
  );
}

/** Shown in the sticky month header while filters are active, so they stay visible (and one tap away) mid-scroll. */
function MonthHeaderFilters({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("transactions.filters");
  const count = activeFilterCount(useSearchParams());
  if (count === 0) return null;
  return (
    <Button
      variant="outline"
      size="xs"
      className="rounded-full bg-background"
      onClick={onOpen}
      aria-label={t("filtersActive", { count })}
    >
      <ListFilter /> {t("filters")}
      <Badge className="h-4 min-w-4 px-1 text-[0.65rem] tabular-nums">
        {count}
      </Badge>
    </Button>
  );
}

function LoadMoreFooter({
  list,
  loadMore,
}: {
  list: TransactionList;
  loadMore: LoadMore;
}) {
  const t = useTranslations("transactions.table");
  const [cursor, setCursor] = useState(loadMore.cursor);
  const [remaining, setRemaining] = useState(loadMore.remaining);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = cursor !== null && remaining > 0;

  const load = useCallback(async () => {
    if (!cursor) return;
    setStatus("loading");
    const result = await loadMoreTransactionsAction(
      loadMore.filters,
      cursor,
    ).catch(() => null);
    if (!result?.ok) return setStatus("error");
    list.append(result.data.rows);
    setRemaining((r) => Math.max(0, r - result.data.rows.length));
    setCursor(result.data.cursor);
    setStatus("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, loadMore.filters]);

  // Re-observed after every batch, so a list that still doesn't reach the end of the screen keeps loading.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || status !== "idle") return;
    const observer = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && load(),
      { rootMargin: "0px 0px 800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, status, load]);

  return (
    <div
      ref={sentinel}
      className="flex flex-col items-center gap-2 py-4 text-sm text-muted-foreground"
    >
      <p aria-live="polite" className="empty:hidden">
        {status === "error" ? t("loadMoreFailed") : !hasMore ? t("end") : null}
      </p>
      {hasMore && (
        <Button
          variant="outline"
          disabled={status === "loading"}
          onClick={load}
          className="w-full"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="animate-spin" /> {t("loading")}
            </>
          ) : status === "error" ? (
            <>
              <RotateCcw /> {t("retry")}
            </>
          ) : (
            t("loadMore", {
              count: Math.min(loadMore.filters.pageSize, remaining),
              remaining,
            })
          )}
        </Button>
      )}
      <BackToTop raised={list.selected.size > 0} />
    </div>
  );
}

/** Floating button that appears once the user has scrolled a few screens down. */
function BackToTop({ raised }: { raised: boolean }) {
  const t = useTranslations("transactions.table");
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 2);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <Button
      size="icon"
      className={cn(
        "fixed right-4 z-20 size-11 rounded-full shadow-lg transition-[bottom] md:hidden",
        raised ? "bottom-36" : "bottom-4",
      )}
      aria-label={t("backToTop")}
      title={t("backToTop")}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUp className="size-5" />
    </Button>
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
  loadMore?: LoadMore;
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
