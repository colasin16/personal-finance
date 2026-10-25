"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { createRuleAction, previewRuleAction, type RuleInput } from "@/lib/actions/transactions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryPicker, type CategoryOption } from "./category-picker";

const MATCH_TYPES = [
  { value: "merchant", label: "Merchant is" },
  { value: "contains", label: "Description contains" },
  { value: "regex", label: "Description matches regex" },
] as const;

/** "Always categorize X as Y" — with a live preview of how many past transactions it would change. */
export function RuleDialog({
  open,
  onOpenChange,
  categories,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  initial: Partial<RuleInput>;
}) {
  const [matchType, setMatchType] = useState<RuleInput["matchType"]>(initial.matchType ?? "merchant");
  const [pattern, setPattern] = useState(initial.pattern ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(initial.categoryId ?? null);
  const [apply, setApply] = useState(true);
  const [preview, setPreview] = useState<{ count: number; examples: string[] } | { error: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!categoryId || pattern.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewRuleAction({ matchType, pattern, categoryId });
      if (!cancelled) setPreview(result.ok ? result.data : { error: result.error });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matchType, pattern, categoryId]);

  const save = () =>
    start(async () => {
      if (!categoryId) return;
      const result = await createRuleAction({ matchType, pattern, categoryId }, apply);
      if (!result.ok) return void toast.error(result.error);
      toast.success(result.data.applied ? `Rule saved and applied to ${result.data.applied} transactions` : "Rule saved");
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-4" /> Create a rule
          </DialogTitle>
          <DialogDescription>Rules run first on every new statement, before automatic categorization.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <Select value={matchType} onValueChange={(v) => setMatchType(v as RuleInput["matchType"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATCH_TYPES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Mercadona" aria-label="Pattern" />
          </div>
          <div className="flex items-center gap-3">
            <Label>Categorize as</Label>
            <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} placeholder="Pick a category" variant="outline" />
          </div>
          {preview && "error" in preview && <p className="text-sm text-destructive">{preview.error}</p>}
          {preview && "count" in preview && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={apply} onCheckedChange={(c) => setApply(c === true)} disabled={preview.count === 0} />
                Also update <strong>{preview.count}</strong> existing transaction{preview.count === 1 ? "" : "s"}
              </label>
              {preview.examples.length > 0 && (
                <ul className="mt-2 space-y-0.5 pl-6 text-xs text-muted-foreground">
                  {preview.examples.map((e) => (
                    <li key={e} className="truncate">
                      {e}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Transactions you categorized by hand are never overwritten.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !categoryId || pattern.trim().length < 2}>
            {pending && <Loader2 className="animate-spin" />} Save rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
