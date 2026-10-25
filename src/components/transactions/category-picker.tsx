"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type CategoryOption = { id: string; name: string; color: string; kind: "expense" | "income" | "transfer" };

const KIND_LABEL = { expense: "Expenses", income: "Income", transfer: "Transfers" } as const;

export function CategoryDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export function CategoryPicker({
  categories,
  value,
  onChange,
  placeholder = "Uncategorized",
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
  const [open, setOpen] = useState(false);
  const current = categories.find((c) => c.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          disabled={disabled}
          className={cn("h-7 max-w-full justify-between gap-1.5 px-2 font-normal", !current && "text-amber-700", className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <CategoryDot color={current?.color ?? "#f59e0b"} />
            <span className="truncate">{current?.name ?? placeholder}</span>
          </span>
          <ChevronDown className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search categories…" />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            {allowNone && (
              <CommandGroup>
                <CommandItem
                  value="uncategorized"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <CategoryDot color="#f59e0b" /> Uncategorized
                </CommandItem>
              </CommandGroup>
            )}
            {(["expense", "income", "transfer"] as const).map((kind) => (
              <CommandGroup key={kind} heading={KIND_LABEL[kind]}>
                {categories
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${kind}`}
                      onSelect={() => {
                        onChange(c.id);
                        setOpen(false);
                      }}
                    >
                      <CategoryDot color={c.color} />
                      {c.name}
                      {c.id === value && <Check className="ml-auto" />}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
