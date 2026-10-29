"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { createRuleAction, previewRuleAction, updateRuleAction, type RuleInput } from "@/lib/actions/transactions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryPicker, type CategoryOption } from "./category-picker";

const MATCH_TYPES = ["merchant", "contains", "regex"] as const;

/**
 * "Always categorize X as Y" — with a live preview of how many past transactions it would change.
 * Pass `ruleId` to edit an existing rule instead of creating one.
 */
export function RuleDialog({
  open,
  onOpenChange,
  categories,
  initial,
  ruleId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  initial: Partial<RuleInput>;
  ruleId?: string;
}) {
  const t = useTranslations("transactions.rule");
  const tc = useTranslations("common");
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
      const input = { matchType, pattern, categoryId };
      const result = ruleId ? await updateRuleAction(ruleId, input, apply) : await createRuleAction(input, apply);
      if (!result.ok) return void toast.error(result.error);
      toast.success(result.data.applied ? t("savedApplied", { count: result.data.applied }) : t("saved"));
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-4" /> {ruleId ? t("editTitle") : t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <Select value={matchType} onValueChange={(v) => setMatchType(v as RuleInput["matchType"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATCH_TYPES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`matchTypes.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Mercadona" aria-label={t("pattern")} />
          </div>
          <div className="flex items-center gap-3">
            <Label>{t("categorizeAs")}</Label>
            <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} placeholder={t("pickCategory")} variant="outline" />
          </div>
          {preview && "error" in preview && <p className="text-sm text-destructive">{preview.error}</p>}
          {preview && "count" in preview && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={apply} onCheckedChange={(c) => setApply(c === true)} disabled={preview.count === 0} />
                <span>{t.rich("applyExisting", { count: preview.count, b: (c) => <strong>{c}</strong> })}</span>
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
              <p className="mt-2 text-xs text-muted-foreground">{t("manualNeverOverwritten")}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("actions.cancel")}
          </Button>
          <Button onClick={save} disabled={pending || !categoryId || pattern.trim().length < 2}>
            {pending && <Loader2 className="animate-spin" />} {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
