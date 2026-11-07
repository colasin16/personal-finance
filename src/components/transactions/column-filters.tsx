"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { format, isBefore, isValid, parse, subMonths } from "date-fns";
import { Check, ListFilter, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { enGB, es } from "react-day-picker/locale";
import { AccountRef, type AccountRefData } from "@/components/accounts/account-ref";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CategoryCommand, type CategoryOption } from "./category-picker";

export type FilterUpdate = (changes: Record<string, string | null>) => void;

/** Sets or clears transaction list URL params, going back to the first page. */
export function useUpdateFilters(): FilterUpdate {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    router.replace(`${pathname}?${next}`);
  };
}

/** Filter icon for a table column header; highlighted while its filter is applied. */
function ColumnFilter({
  label,
  active,
  contentClassName,
  onOpenChange,
  children,
}: {
  label: string;
  active: boolean;
  contentClassName?: string;
  onOpenChange?: (open: boolean) => void;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className={cn("relative size-6", active ? "text-primary" : "text-muted-foreground")}
          aria-label={label}
          title={label}
        >
          <ListFilter className="size-3.5" />
          {active && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-64 p-0", contentClassName)} align="start">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

export function AccountColumnFilter({ accounts }: { accounts: (AccountRefData & { id: string })[] }) {
  const t = useTranslations("transactions.filters");
  const params = useSearchParams();
  const update = useUpdateFilters();
  const current = params.get("account");
  return (
    <ColumnFilter label={t("filterAccount")} active={!!current}>
      {(close) => {
        const pick = (id: string | null) => {
          update({ account: id });
          close();
        };
        return (
          <Command>
            <CommandList>
              <CommandGroup>
                <CommandItem value="all" onSelect={() => pick(null)}>
                  {t("allAccounts")}
                  {!current && <Check className="ml-auto" />}
                </CommandItem>
                {accounts.map((a) => (
                  <CommandItem key={a.id} value={a.id} onSelect={() => pick(a.id)}>
                    <AccountRef account={a} className="min-w-0" />
                    {a.id === current && <Check className="ml-auto" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        );
      }}
    </ColumnFilter>
  );
}

export function CategoryColumnFilter({ categories }: { categories: CategoryOption[] }) {
  const t = useTranslations("transactions.filters");
  const params = useSearchParams();
  const update = useUpdateFilters();
  const current = params.get("category");
  return (
    <ColumnFilter label={t("filterCategory")} active={!!current}>
      {(close) => {
        const pick = (category: string | null) => {
          update({ category });
          close();
        };
        return (
          <CategoryCommand
            categories={categories}
            value={current}
            allowNone
            noneSelected={current === "none"}
            onSelect={(id) => pick(id ?? "none")}
            leading={
              <CommandItem value={t("allCategories")} onSelect={() => pick(null)}>
                {t("allCategories")}
                {!current && <Check className="ml-auto" />}
              </CommandItem>
            }
          />
        );
      }}
    </ColumnFilter>
  );
}

const ISO = "yyyy-MM-dd";
const parseIso = (value: string | null) => {
  if (!value) return undefined;
  const d = parse(value, ISO, new Date());
  return isValid(d) ? d : undefined;
};

/** Two-month range calendar (shadcn Range Picker); the first click picks the start, the second the end and applies. */
export function DateColumnFilter() {
  const t = useTranslations("transactions.filters");
  const locale = useLocale();
  const params = useSearchParams();
  const update = useUpdateFilters();
  const from = parseIso(params.get("from"));
  const to = parseIso(params.get("to"));
  const [draft, setDraft] = useState<DateRange | undefined>();
  const range = draft ?? (from || to ? { from, to } : undefined);

  return (
    <ColumnFilter label={t("filterDate")} active={!!(from || to)} contentClassName="w-auto" onOpenChange={() => setDraft(undefined)}>
      {(close) => {
        const pick = (_: DateRange | undefined, day: Date) => {
          if (!draft?.from || draft.to) {
            setDraft({ from: day, to: undefined });
            return;
          }
          const [start, end] = isBefore(day, draft.from) ? [day, draft.from] : [draft.from, day];
          update({ from: format(start, ISO), to: format(end, ISO) });
          setDraft(undefined);
          close();
        };
        const clear = () => {
          update({ from: null, to: null });
          setDraft(undefined);
          close();
        };
        return (
          <div>
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={from ?? to ?? subMonths(new Date(), 1)}
              selected={range}
              onSelect={pick}
              locale={locale === "es" ? es : enGB}
            />
            <div className="flex items-center justify-between gap-2 border-t p-2 pl-3">
              <p className="text-xs text-muted-foreground">{draft?.from && !draft.to ? t("pickEnd") : t("pickStart")}</p>
              {(from || to) && (
                <Button variant="ghost" size="sm" onClick={clear}>
                  <X /> {t("clearDates")}
                </Button>
              )}
            </div>
          </div>
        );
      }}
    </ColumnFilter>
  );
}
