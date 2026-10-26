"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CategoryIcon, categoryTint } from "./category-label";

const MAX_RESULTS = 90;
// Shown before the user types: the icons of the default categories.
const SUGGESTED = ["home", "zap", "shopping-basket", "utensils", "train-front", "car", "heart-pulse", "dumbbell", "graduation-cap", "shopping-bag", "plane", "repeat", "shield", "landmark", "baby", "paw-print", "gift", "banknote", "briefcase", "coins", "piggy-bank", "arrow-left-right"];

/** Searchable picker over every Lucide icon. The name list is fetched on first open and each icon loads on demand. */
export function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (icon: string) => void }) {
  const t = useTranslations("settings.categories");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const [all, setAll] = useState<string[] | null>(null);

  useEffect(() => {
    if (open && !all) void import("lucide-react/dynamicIconImports").then((m) => setAll(Object.keys(m.default)));
  }, [open, all]);

  const results = useMemo(() => {
    if (!deferred) return { names: SUGGESTED, total: SUGGESTED.length };
    if (!all) return { names: [], total: 0 };
    const terms = deferred.split(/\s+/);
    const matches = all.filter((name) => terms.every((term) => name.includes(term)));
    // Exact and prefix matches first so "car" finds "car" before "car-front".
    matches.sort((a, b) => Number(b === deferred) - Number(a === deferred) || Number(b.startsWith(deferred)) - Number(a.startsWith(deferred)) || a.length - b.length);
    return { names: matches.slice(0, MAX_RESULTS), total: matches.length };
  }, [deferred, all]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={t("icon")} title={t("icon")} className="rounded-md border" style={categoryTint(color)}>
          <CategoryIcon icon={value} className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-2">
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("iconSearch")} aria-label={t("iconSearch")} />
        {results.names.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{deferred && !all ? "…" : t("iconEmpty")}</p>
        ) : (
          <div role="listbox" aria-label={t("icon")} className="grid max-h-60 grid-cols-6 gap-1 overflow-y-auto">
            {results.names.map((name) => (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={name === value}
                title={name}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className="flex size-10 items-center justify-center rounded-md hover:bg-muted aria-selected:ring-2 aria-selected:ring-foreground"
              >
                <CategoryIcon icon={name} className="size-5" />
              </button>
            ))}
          </div>
        )}
        {deferred && results.total > MAX_RESULTS && <p className="text-xs text-muted-foreground">{t("iconMore", { count: MAX_RESULTS })}</p>}
      </PopoverContent>
    </Popover>
  );
}
