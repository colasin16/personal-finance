"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Flag, ListFilter, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AccountRef,
  type AccountRefData,
} from "@/components/accounts/account-ref";
import {
  CategoryLabel,
  UNCATEGORIZED_COLOR,
  UNCATEGORIZED_ICON,
} from "@/components/transactions/category-label";
import {
  CategoryPicker,
  type CategoryOption,
} from "@/components/transactions/category-picker";
import {
  useUpdateFilters,
  type FilterUpdate,
} from "@/components/transactions/column-filters";
import {
  activeFilterCount,
  useFiltersDialog,
} from "@/components/transactions/filters-dialog-context";
import { formatDate } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ALL = "all";
/** Everything but the free-text search, which stays visible on its own. */
const FILTER_KEYS = [
  "account",
  "category",
  "from",
  "to",
  "flagged",
  "statement",
];

type Account = AccountRefData & { id: string };
type Update = FilterUpdate;

/**
 * Inline filter bar from `md` up (account and category live in the table column headers, see column-filters.tsx;
 * the account select stays here below `lg`, where the Account column is hidden); on smaller screens a search bar, a Filters button opening a full-screen dialog, and a card listing the active filters. */
export function TransactionFilters({
  accounts,
  categories,
  total,
}: {
  accounts: Account[];
  categories: CategoryOption[];
  total: number;
}) {
  const t = useTranslations("transactions.filters");
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [localOpen, setLocalOpen] = useState(false);
  const { open, setOpen } = useFiltersDialog() ?? {
    open: localOpen,
    setOpen: setLocalOpen,
  };

  const update = useUpdateFilters();

  // Set when "Clear all" already removed `q` from the URL, so the debounced sync below doesn't re-apply stale params.
  const skipSync = useRef(false);
  useEffect(() => {
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update({ q: q.trim() || null });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const clearFilters = () =>
    update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));
  const clearAll = () => {
    if (q) {
      skipSync.current = true;
      setQ("");
    }
    update(Object.fromEntries(["q", ...FILTER_KEYS].map((k) => [k, null])));
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full md:w-64">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          className="pl-8 md:pr-8"
        />
        {q && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 hidden size-7 md:inline-flex"
            onClick={() => setQ("")}
            aria-label={t("clearSearch")}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="hidden md:contents">
        <FilterControls
          accounts={accounts}
          categories={categories}
          update={update}
        />
        <ActiveFilters
          accounts={accounts}
          categories={categories}
          update={update}
          onClear={clearAll}
          inline
        />
      </div>

      <div className="w-full space-y-3 md:hidden">
        <MobileFilterButton onClick={() => setOpen(true)} />
        <ActiveFilters
          accounts={accounts}
          categories={categories}
          update={update}
          onClear={clearFilters}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-0 left-0 flex h-dvh max-h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none md:hidden data-open:zoom-in-100 data-closed:zoom-out-100 data-open:slide-in-from-bottom-4">
          <DialogHeader className="border-b p-4 pr-12">
            <DialogTitle>{t("filters")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("filtersDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <FilterControls
              accounts={accounts}
              categories={categories}
              update={update}
              stacked
            />
          </div>
          <DialogFooter className="m-0 flex-row gap-2 border-t bg-background p-4">
            <Button
              variant="outline"
              className="flex-1"
              disabled={!FILTER_KEYS.some((k) => params.get(k))}
              onClick={clearFilters}
            >
              <X /> {t("clearAll")}
            </Button>
            <Button className="flex-1" onClick={() => setOpen(false)}>
              {t("showResults", { count: total })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MobileFilterButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("transactions.filters");
  const params = useSearchParams();
  const count = activeFilterCount(params);
  return (
    <Button variant="outline" onClick={onClick}>
      <ListFilter /> {t("filters")}
      {count > 0 && (
        <Badge className="ml-0.5 h-5 min-w-5 px-1.5 tabular-nums">
          {count}
        </Badge>
      )}
    </Button>
  );
}

function FilterControls({
  accounts,
  categories,
  update,
  stacked = false,
}: {
  accounts: Account[];
  categories: CategoryOption[];
  update: Update;
  stacked?: boolean;
}) {
  const t = useTranslations("transactions.filters");
  const params = useSearchParams();
  const category = params.get("category");
  const flagged = params.get("flagged") === "1";

  const account = (
    <Select
      value={params.get("account") ?? ALL}
      onValueChange={(v) => update({ account: v === ALL ? null : v })}
    >
      <SelectTrigger
        className={cn("[&>span]:min-w-0", stacked ? "w-full" : "w-56")}
        aria-label={t("account")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t("allAccounts")}</SelectItem>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <AccountRef account={a} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const categoryPicker = (
    <div
      className={cn(
        "flex items-center rounded-md border bg-background",
        stacked && "w-full justify-between",
      )}
    >
      <CategoryPicker
        categories={categories}
        value={category && category !== "none" ? category : null}
        onChange={(id) => update({ category: id ?? "none" })}
        placeholder={category === "none" ? undefined : t("allCategories")}
        allowNone
        className={cn(
          "h-8",
          !category && "text-foreground",
          stacked && "h-9 min-w-0 flex-1",
        )}
      />
      {category && (
        <Button
          variant="ghost"
          size="icon"
          className={stacked ? "size-9" : "size-8"}
          onClick={() => update({ category: null })}
          aria-label={t("clearCategory")}
        >
          <X />
        </Button>
      )}
    </div>
  );
  const dateInput = (key: "from" | "to") => (
    <Input
      type="date"
      className={stacked ? "w-full" : "w-36"}
      value={params.get(key) ?? ""}
      onChange={(e) => update({ [key]: e.target.value || null })}
      aria-label={t(key)}
    />
  );
  const toggles = (
    <>
      <Button
        variant={flagged ? "default" : "outline"}
        size={stacked ? "default" : "sm"}
        onClick={() => update({ flagged: flagged ? null : "1" })}
        aria-pressed={flagged}
      >
        <Flag /> {t("needsAttention")}
      </Button>
    </>
  );

  if (!stacked) {
    return (
      <>
        <div className="lg:hidden">{account}</div>
        {toggles}
      </>
    );
  }
  return (
    <>
      <Field label={t("account")}>{account}</Field>
      <Field label={t("category")}>{categoryPicker}</Field>
      <Field label={t("dates")}>
        <div className="grid gap-2">
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground">
            <span>{t("from")}</span>
            {dateInput("from")}
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground">
            <span>{t("to")}</span>
            {dateInput("to")}
          </label>
        </div>
      </Field>
      <Field label={t("status")}>
        <div className="flex flex-wrap gap-2">{toggles}</div>
      </Field>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}

/** One removable chip per active filter: a floating card styled like the bulk-selection bar on mobile, a plain full-width row on desktop (`inline`). */
function ActiveFilters({
  accounts,
  categories,
  update,
  onClear,
  inline = false,
}: {
  accounts: Account[];
  categories: CategoryOption[];
  update: Update;
  onClear: () => void;
  inline?: boolean;
}) {
  const t = useTranslations("transactions.filters");
  const tc = useTranslations("common");
  const locale = useLocale();
  const params = useSearchParams();
  const chips: {
    key: string;
    label: ReactNode;
    clear: Record<string, null>;
  }[] = [];

  const account = accounts.find((a) => a.id === params.get("account"));
  if (account)
    chips.push({
      key: "account",
      label: <AccountRef account={account} />,
      clear: { account: null },
    });

  const categoryId = params.get("category");
  if (categoryId) {
    const c = categories.find((x) => x.id === categoryId);
    chips.push({
      key: "category",
      label: c ? (
        <CategoryLabel name={c.name} icon={c.icon} color={c.color} />
      ) : (
        <CategoryLabel
          name={tc("uncategorized")}
          icon={UNCATEGORIZED_ICON}
          color={UNCATEGORIZED_COLOR}
        />
      ),
      clear: { category: null },
    });
  }

  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    const label =
      from && to
        ? `${formatDate(from, locale)} – ${formatDate(to, locale)}`
        : from
          ? `${t("from")} ${formatDate(from, locale)}`
          : `${t("to")} ${formatDate(to!, locale)}`;
    chips.push({ key: "dates", label, clear: { from: null, to: null } });
  }
  if (params.get("flagged") === "1")
    chips.push({
      key: "flagged",
      label: (
        <>
          <Flag className="size-3.5" /> {t("needsAttention")}
        </>
      ),
      clear: { flagged: null },
    });
  if (params.get("statement"))
    chips.push({
      key: "statement",
      label: t("statement"),
      clear: { statement: null },
    });

  if (chips.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        inline
          ? "w-full"
          : "rounded-xl border bg-background p-2 pl-3 shadow-md",
      )}
    >
      <ul
        className={cn("flex min-w-0 flex-wrap gap-2", !inline && "flex-1")}
        aria-label={t("activeFilters")}
      >
        {chips.map((c) => (
          <li
            key={c.key}
            className="flex h-8 max-w-full min-w-0 items-center gap-1 rounded-lg border bg-muted/40 pr-0.5 pl-2.5 text-xs font-medium"
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {c.label}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => update(c.clear)}
              aria-label={t("removeFilter")}
            >
              <X className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        className={inline ? undefined : "ml-auto"}
        onClick={onClear}
      >
        <X /> {inline ? t("clearAll") : t("clear")}
      </Button>
    </div>
  );
}
