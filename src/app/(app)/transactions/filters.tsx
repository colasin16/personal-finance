"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Flag, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountRef, type AccountRefData } from "@/components/accounts/account-ref";
import { CategoryPicker, type CategoryOption } from "@/components/transactions/category-picker";
import { cn } from "@/lib/utils";

const ALL = "all";

export function TransactionFilters({ accounts, categories }: { accounts: (AccountRefData & { id: string })[]; categories: CategoryOption[] }) {
  const t = useTranslations("transactions.filters");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (changes: Record<string, string | null>) => {
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

  const category = params.get("category");
  const flagged = params.get("flagged") === "1";
  const removed = params.get("removed") === "1";
  const active = ["q", "account", "category", "from", "to", "flagged", "removed", "statement"].some((k) => params.get(k));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="pl-8" />
      </div>
      <Select value={params.get("account") ?? ALL} onValueChange={(v) => update({ account: v === ALL ? null : v })}>
        <SelectTrigger className="w-56 [&>span]:min-w-0">
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
      <div className="flex items-center rounded-md border bg-background">
        <CategoryPicker
          categories={categories}
          value={category && category !== "none" ? category : null}
          onChange={(id) => update({ category: id ?? "none" })}
          placeholder={category === "none" ? undefined : t("allCategories")}
          allowNone
          className={cn("h-8", !category && "text-foreground")}
        />
        {category && (
          <Button variant="ghost" size="icon" className="size-8" onClick={() => update({ category: null })} aria-label={t("clearCategory")}>
            <X />
          </Button>
        )}
      </div>
      <Input type="date" className="w-36" value={params.get("from") ?? ""} onChange={(e) => update({ from: e.target.value || null })} aria-label={t("from")} />
      <Input type="date" className="w-36" value={params.get("to") ?? ""} onChange={(e) => update({ to: e.target.value || null })} aria-label={t("to")} />
      <Button variant={flagged ? "default" : "outline"} size="sm" onClick={() => update({ flagged: flagged ? null : "1" })}>
        <Flag /> {t("needsAttention")}
      </Button>
      <Button variant={removed ? "default" : "outline"} size="sm" onClick={() => update({ removed: removed ? null : "1" })}>
        <Trash2 /> {t("removed")}
      </Button>
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            router.replace(pathname);
          }}
        >
          <X /> {t("reset")}
        </Button>
      )}
    </div>
  );
}
