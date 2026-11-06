"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Flag, ListFilter, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountRef, type AccountRefData } from "@/components/accounts/account-ref";
import { CategoryLabel, UNCATEGORIZED_COLOR, UNCATEGORIZED_ICON } from "@/components/transactions/category-label";
import { CategoryPicker, type CategoryOption } from "@/components/transactions/category-picker";
import { formatDate } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ALL = "all";
/** Everything but the free-text search, which stays visible on its own. */
const FILTER_KEYS = ["account", "category", "from", "to", "flagged", "removed", "statement"];

type Account = AccountRefData & { id: string };
type Update = (changes: Record<string, string | null>) => void;

/** Inline filter bar from `md` up; on smaller screens a search bar, a Filters button opening a full-screen dialog, and a card listing the active filters. */
export function TransactionFilters({ accounts, categories, total }: { accounts: Account[]; categories: CategoryOption[]; total: number }) {
  const t = useTranslations("transactions.filters");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);

  const update: Update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    router.replace(`${pathname}?${next}`);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update({ q: q.trim() || null });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["q", ...FILTER_KEYS].some((k) => params.get(k));
  const reset = () => {
    setQ("");
    const size = params.get("size");
    router.replace(size ? `${pathname}?${new URLSearchParams({ size })}` : pathname);
  };
  const clearFilters = () => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full md:w-64">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="pl-8" />
      </div>

      <div className="hidden md:contents">
        <FilterControls accounts={accounts} categories={categories} update={update} />
        {active && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <X /> {t("reset")}
          </Button>
        )}
      </div>

      <div className="w-full space-y-3 md:hidden">
        <MobileFilterButton onClick={() => setOpen(true)} />
        <ActiveFilters accounts={accounts} categories={categories} update={update} onClear={clearFilters} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-0 left-0 flex h-dvh max-h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none md:hidden data-open:zoom-in-100 data-closed:zoom-out-100 data-open:slide-in-from-bottom-4">
          <DialogHeader className="border-b p-4 pr-12">
            <DialogTitle>{t("filters")}</DialogTitle>
            <DialogDescription className="sr-only">{t("filtersDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <FilterControls accounts={accounts} categories={categories} update={update} stacked />
          </div>
          <DialogFooter className="m-0 flex-row gap-2 border-t bg-background p-4">
            <Button variant="outline" className="flex-1" disabled={!FILTER_KEYS.some((k) => params.get(k))} onClick={clearFilters}>
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
      {count > 0 && <Badge className="ml-0.5 h-5 min-w-5 px-1.5 tabular-nums">{count}</Badge>}
    </Button>
  );
}

/** From/to count as one filter, as they are shown as a single date range. */
const activeFilterCount = (params: URLSearchParams) =>
  ["account", "category", "flagged", "removed", "statement"].filter((k) => params.get(k)).length + (params.get("from") || params.get("to") ? 1 : 0);

function FilterControls({ accounts, categories, update, stacked = false }: { accounts: Account[]; categories: CategoryOption[]; update: Update; stacked?: boolean }) {
  const t = useTranslations("transactions.filters");
  const params = useSearchParams();
  const category = params.get("category");
  const flagged = params.get("flagged") === "1";
  const removed = params.get("removed") === "1";

  const account = (
    <Select value={params.get("account") ?? ALL} onValueChange={(v) => update({ account: v === ALL ? null : v })}>
      <SelectTrigger className={cn("[&>span]:min-w-0", stacked ? "w-full" : "w-56")} aria-label={t("account")}>
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
    <div className={cn("flex items-center rounded-md border bg-background", stacked && "w-full justify-between")}>
      <CategoryPicker
        categories={categories}
        value={category && category !== "none" ? category : null}
        onChange={(id) => update({ category: id ?? "none" })}
        placeholder={category === "none" ? undefined : t("allCategories")}
        allowNone
        className={cn("h-8", !category && "text-foreground", stacked && "h-9 min-w-0 flex-1")}
      />
      {category && (
        <Button variant="ghost" size="icon" className={stacked ? "size-9" : "size-8"} onClick={() => update({ category: null })} aria-label={t("clearCategory")}>
          <X />
        </Button>
      )}
    </div>
  );
  const dateInput = (key: "from" | "to") => (
    <Input type="date" className={stacked ? "w-full" : "w-36"} value={params.get(key) ?? ""} onChange={(e) => update({ [key]: e.target.value || null })} aria-label={t(key)} />
  );
  const toggles = (
    <>
      <Button variant={flagged ? "default" : "outline"} size={stacked ? "default" : "sm"} onClick={() => update({ flagged: flagged ? null : "1" })} aria-pressed={flagged}>
        <Flag /> {t("needsAttention")}
      </Button>
      <Button variant={removed ? "default" : "outline"} size={stacked ? "default" : "sm"} onClick={() => update({ removed: removed ? null : "1" })} aria-pressed={removed}>
        <Trash2 /> {t("removed")}
      </Button>
    </>
  );

  if (!stacked) {
    return (
      <>
        {account}
        {categoryPicker}
        {dateInput("from")}
        {dateInput("to")}
        {toggles}
      </>
    );
  }
  return (
    <>
      <Field label={t("account")}>{account}</Field>
      <Field label={t("category")}>{categoryPicker}</Field>
      <Field label={t("dates")}>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>{t("from")}</span>
            {dateInput("from")}
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
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

/** Floating card with one removable chip per active filter, styled like the bulk-selection bar. */
function ActiveFilters({ accounts, categories, update, onClear }: { accounts: Account[]; categories: CategoryOption[]; update: Update; onClear: () => void }) {
  const t = useTranslations("transactions.filters");
  const tc = useTranslations("common");
  const locale = useLocale();
  const params = useSearchParams();
  const chips: { key: string; label: ReactNode; clear: Record<string, null> }[] = [];

  const account = accounts.find((a) => a.id === params.get("account"));
  if (account) chips.push({ key: "account", label: <AccountRef account={account} />, clear: { account: null } });

  const categoryId = params.get("category");
  if (categoryId) {
    const c = categories.find((x) => x.id === categoryId);
    chips.push({
      key: "category",
      label: c ? (
        <CategoryLabel name={c.name} icon={c.icon} color={c.color} />
      ) : (
        <CategoryLabel name={tc("uncategorized")} icon={UNCATEGORIZED_ICON} color={UNCATEGORIZED_COLOR} />
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
    chips.push({ key: "flagged", label: <><Flag className="size-3.5" /> {t("needsAttention")}</>, clear: { flagged: null } });
  if (params.get("removed") === "1")
    chips.push({ key: "removed", label: <><Trash2 className="size-3.5" /> {t("removed")}</>, clear: { removed: null } });
  if (params.get("statement")) chips.push({ key: "statement", label: t("statement"), clear: { statement: null } });

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2 pl-3 shadow-md">
      <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
        {chips.map((c) => (
          <li key={c.key} className="flex h-8 max-w-full min-w-0 items-center gap-1 rounded-lg border bg-muted/40 pr-0.5 pl-2.5 text-xs font-medium">
            <span className="flex min-w-0 items-center gap-1.5 truncate">{c.label}</span>
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => update(c.clear)} aria-label={t("removeFilter")}>
              <X className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
        <X /> {t("clear")}
      </Button>
    </div>
  );
}
