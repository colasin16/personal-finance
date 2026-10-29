"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, MoreHorizontal, Pencil, Play, Plus, Search, Trash2, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import { applyAllRulesAction, deleteRuleAction, reorderRulesAction, setRuleEnabledAction } from "@/lib/actions/transactions";
import type { MatchType } from "@/lib/domain/rules";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CategoryLabel } from "@/components/transactions/category-label";
import { CategoryPicker, type CategoryOption } from "@/components/transactions/category-picker";
import { RuleDialog } from "@/components/transactions/rule-dialog";

export type RuleRow = {
  id: string;
  matchType: MatchType;
  pattern: string;
  categoryId: string;
  enabled: boolean;
  hits: number;
  lastMatchedAt: Date | null;
};

/** Rules in evaluation order: drag to change priority, toggle, edit, delete and re-apply them. */
export function RulesManager({ rules, categories }: { rules: RuleRow[]; categories: CategoryOption[] }) {
  const t = useTranslations("settings.rules");
  const tc = useTranslations("common");
  const [items, setItems] = useState(rules);
  const [synced, setSynced] = useState(rules);
  if (synced !== rules) {
    setSynced(rules);
    setItems(rules);
  }
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<RuleRow | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [pending, start] = useTransition();

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const needle = query.trim().toLowerCase();
  const filtering = needle !== "" || categoryId !== null;
  const visible = items.filter((r) => (!categoryId || r.categoryId === categoryId) && r.pattern.toLowerCase().includes(needle));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const previous = items;
    const next = arrayMove(
      items,
      items.findIndex((r) => r.id === active.id),
      items.findIndex((r) => r.id === over.id),
    );
    setItems(next);
    start(async () => {
      const result = await reorderRulesAction(next.map((r) => r.id));
      if (!result.ok) {
        setItems(previous);
        toast.error(result.error);
      }
    });
  };

  const toggle = (rule: RuleRow, enabled: boolean) => {
    setItems((list) => list.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
    start(async () => {
      const result = await setRuleEnabledAction(rule.id, enabled);
      if (!result.ok) {
        setItems((list) => list.map((r) => (r.id === rule.id ? { ...r, enabled: !enabled } : r)));
        toast.error(result.error);
      }
    });
  };

  const remove = (rule: RuleRow) =>
    start(async () => {
      const result = await deleteRuleAction(rule.id);
      if (!result.ok) return void toast.error(result.error);
      setItems((list) => list.filter((r) => r.id !== rule.id));
      setDeleting(null);
      toast.success(t("deleted"));
    });

  const applyAll = () =>
    start(async () => {
      const result = await applyAllRulesAction();
      if (!result.ok) return void toast.error(result.error);
      setApplyingAll(false);
      toast.success(t("applyAll.done", { count: result.data.applied }));
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-8 pl-8" />
        </div>
        <div className="flex items-center rounded-md border bg-background">
          <CategoryPicker
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            placeholder={t("allCategories")}
            className={cn("h-8", !categoryId && "text-foreground")}
          />
          {categoryId && (
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setCategoryId(null)} aria-label={t("clearCategory")}>
              <X />
            </Button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setApplyingAll(true)} disabled={items.length === 0}>
          <Play /> {t("applyAll.button")}
        </Button>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> {t("new")}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          <WandSparkles className="size-6" />
          <p>{t("empty")}</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtering ? t("reorderDisabled") : t("orderHint")}</p>
          <DndContext id="rules-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visible.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y rounded-lg border bg-card">
                {visible.map((rule) => (
                  <RuleItem
                    key={rule.id}
                    rule={rule}
                    position={items.indexOf(rule) + 1}
                    category={categoryById.get(rule.categoryId)}
                    sortable={!filtering}
                    onToggle={(enabled) => toggle(rule, enabled)}
                    onEdit={() => setEditing(rule)}
                    onDelete={() => setDeleting(rule)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {editing && (
        <RuleDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          categories={categories}
          ruleId={editing === "new" ? undefined : editing.id}
          initial={editing === "new" ? {} : { matchType: editing.matchType, pattern: editing.pattern, categoryId: editing.categoryId }}
        />
      )}

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirm.title")}</DialogTitle>
            <DialogDescription>{t("deleteConfirm.description", { pattern: deleting?.pattern ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {tc("actions.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => deleting && remove(deleting)} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={applyingAll} onOpenChange={setApplyingAll}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("applyAll.title")}</DialogTitle>
            <DialogDescription>{t("applyAll.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApplyingAll(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button onClick={applyAll} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} {t("applyAll.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleItem({
  rule,
  position,
  category,
  sortable,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: RuleRow;
  position: number;
  category: CategoryOption | undefined;
  sortable: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("settings.rules");
  const format = useFormatter();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id, disabled: !sortable });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative flex items-center gap-2 bg-card px-2 py-2.5 text-sm first:rounded-t-lg last:rounded-b-lg sm:gap-3", isDragging && "z-10 rounded-lg shadow-lg")}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className={cn(
          "flex size-7 shrink-0 touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
          sortable ? "cursor-grab active:cursor-grabbing" : "invisible",
        )}
        aria-label={t("reorder", { pattern: rule.pattern })}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{position}</span>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3", !rule.enabled && "opacity-50")}>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 truncate text-left hover:underline">
          <span className="text-muted-foreground">{t(`match.${rule.matchType}`)}</span> <span className="font-medium">“{rule.pattern}”</span>
        </button>
        {category && <CategoryLabel name={category.name} icon={category.icon} color={category.color} className="self-start whitespace-nowrap sm:self-auto" />}
        <span className="text-xs whitespace-nowrap text-muted-foreground sm:w-44 sm:text-right">
          {t("hits", { count: rule.hits })}
          {rule.lastMatchedAt && <span className="block">{t("lastMatched", { when: format.relativeTime(rule.lastMatchedAt) })}</span>}
        </span>
      </div>
      <Switch checked={rule.enabled} onCheckedChange={onToggle} aria-label={t("enabled", { pattern: rule.pattern })} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label={t("actions")}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
