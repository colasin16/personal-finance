"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CategoryLabel, UNCATEGORIZED_COLOR, UNCATEGORIZED_ICON } from "./category-label";

export type CategoryOption = { id: string; name: string; icon?: string | null; color: string; kind: "expense" | "income" | "transfer" };

export function CategoryPicker({
  categories,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  allowNone = false,
  variant = "ghost",
}: {
  categories: CategoryOption[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowNone?: boolean;
  variant?: "ghost" | "outline";
}) {
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const current = categories.find((c) => c.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          disabled={disabled}
          className={cn("h-7 max-w-full justify-between gap-1.5 px-2 font-normal", className)}
        >
          {current ? (
            <CategoryLabel name={current.name} icon={current.icon} color={current.color} />
          ) : placeholder ? (
            <span className="truncate">{placeholder}</span>
          ) : (
            <CategoryLabel name={tc("uncategorized")} icon={UNCATEGORIZED_ICON} color={UNCATEGORIZED_COLOR} />
          )}
          <ChevronDown className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-60 p-0"
        align="start"
        onOpenAutoFocus={(e) => {
          // Focusing the search box on touch devices pops up the on-screen keyboard, which hides the list.
          if (window.matchMedia("(pointer: coarse)").matches) e.preventDefault();
        }}
      >
        <CategoryCommand
          categories={categories}
          value={value}
          allowNone={allowNone}
          onSelect={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Searchable category list grouped by kind, shared by CategoryPicker and the category column filter.
 * `null` stands for "Uncategorized"; `noneSelected` checks it, `leading` renders extra items above it.
 */
export function CategoryCommand({
  categories,
  value,
  onSelect,
  allowNone = false,
  noneSelected = false,
  leading,
}: {
  categories: CategoryOption[];
  value: string | null;
  onSelect: (categoryId: string | null) => void;
  allowNone?: boolean;
  noneSelected?: boolean;
  leading?: ReactNode;
}) {
  const t = useTranslations("transactions.picker");
  const tc = useTranslations("common");
  return (
    <Command>
      <CommandInput placeholder={t("search")} />
      <CommandList>
        <CommandEmpty>{t("empty")}</CommandEmpty>
        {(leading || allowNone) && (
          <CommandGroup>
            {leading}
            {allowNone && (
              <CommandItem value="uncategorized" onSelect={() => onSelect(null)}>
                <CategoryLabel name={tc("uncategorized")} icon={UNCATEGORIZED_ICON} color={UNCATEGORIZED_COLOR} />
                {noneSelected && <Check className="ml-auto" />}
              </CommandItem>
            )}
          </CommandGroup>
        )}
        {(["expense", "income", "transfer"] as const).map((kind) => (
          <CommandGroup key={kind} heading={t(`kinds.${kind}`)}>
            {categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <CommandItem key={c.id} value={`${c.name} ${kind}`} onSelect={() => onSelect(c.id)}>
                  <CategoryLabel name={c.name} icon={c.icon} color={c.color} />
                  {c.id === value && <Check className="ml-auto" />}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
