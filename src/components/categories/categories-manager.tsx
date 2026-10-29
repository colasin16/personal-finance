"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Lock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCategoryAction, updateCategoryAction } from "@/lib/actions/household";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryLabel } from "@/components/transactions/category-label";
import { CategoryPicker, type CategoryOption } from "@/components/transactions/category-picker";
import { IconPicker } from "@/components/transactions/icon-picker";
import { ColorSwatches } from "./color-swatches";

const KINDS = ["expense", "income", "transfer"] as const;

export type ManagedCategory = CategoryOption & {
  /** Built-in categories the app depends on: they can be edited but not deleted or change kind. */
  system: boolean;
  transactions: number;
  rules: number;
};

/** Categories grouped by kind, with edit and delete (moving their transactions elsewhere). */
export function CategoriesManager({ categories }: { categories: ManagedCategory[] }) {
  const t = useTranslations("settings.categories");
  const [editing, setEditing] = useState<ManagedCategory | null>(null);
  const [deleting, setDeleting] = useState<ManagedCategory | null>(null);

  return (
    <div className="space-y-5">
      {KINDS.map((kind) => {
        const list = categories.filter((c) => c.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind}>
            <h3 className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">{t(`kinds.${kind}`)}</h3>
            <ul className="grid gap-x-4 sm:grid-cols-2">
              {list.map((c) => (
                <li key={c.id} className="flex items-center gap-2 border-b py-1.5 text-sm">
                  <button type="button" onClick={() => setEditing(c)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={t("edit")}>
                    <CategoryLabel name={c.name} icon={c.icon} color={c.color} className="min-w-0" />
                    {c.system && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label={t("system")} />}
                  </button>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t("transactions", { count: c.transactions })}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7" aria-label={t("actions", { name: c.name })}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(c)}>
                        <Pencil /> {t("edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" disabled={c.system} onSelect={() => setDeleting(c)}>
                        <Trash2 /> {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {editing && <EditCategoryDialog key={editing.id} category={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <DeleteCategoryDialog key={deleting.id} category={deleting} categories={categories.filter((c) => c.id !== deleting.id)} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

function EditCategoryDialog({ category, onClose }: { category: ManagedCategory; onClose: () => void }) {
  const t = useTranslations("settings.categories");
  const tc = useTranslations("common");
  const [name, setName] = useState(category.name);
  const [kind, setKind] = useState(category.kind);
  const [icon, setIcon] = useState(category.icon ?? "tag");
  const [color, setColor] = useState(category.color);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const result = await updateCategoryAction(category.id, { name, kind, icon, color });
      if (!result.ok) return void toast.error(result.error);
      toast.success(t("saved"));
      onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>
        <form
          id="edit-category"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-category-name">{t("name")}</Label>
            <div className="flex gap-2">
              <IconPicker value={icon} color={color} onChange={setIcon} />
              <Input id="edit-category-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required className="flex-1" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("kind")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)} disabled={category.system}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`kinds.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category.system && <p className="text-xs text-muted-foreground">{t("systemHint")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>{t("color")}</Label>
            <ColorSwatches value={color} onChange={setColor} label={t("color")} />
          </div>
          <div className="rounded-lg bg-muted p-3">
            <CategoryLabel name={name.trim() || category.name} icon={icon} color={color} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button type="submit" form="edit-category" disabled={pending || name.trim() === ""}>
            {pending && <Loader2 className="animate-spin" />} {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCategoryDialog({ category, categories, onClose }: { category: ManagedCategory; categories: ManagedCategory[]; onClose: () => void }) {
  const t = useTranslations("settings.categories");
  const tc = useTranslations("common");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inUse = category.transactions > 0 || category.rules > 0;
  const target = categories.find((c) => c.id === targetId);

  const remove = () =>
    start(async () => {
      const result = await deleteCategoryAction(category.id, targetId);
      if (!result.ok) return void toast.error(result.error);
      toast.success(target ? t("deleteDialog.movedTo", { count: result.data.moved, name: target.name }) : t("deleteDialog.deleted"));
      onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("deleteDialog.title")} <CategoryLabel name={category.name} icon={category.icon} color={category.color} />
          </DialogTitle>
          <DialogDescription>
            {inUse ? t("deleteDialog.usage", { transactions: category.transactions, rules: category.rules }) : t("deleteDialog.unused")}
          </DialogDescription>
        </DialogHeader>
        {inUse && (
          <div className="space-y-2">
            <Label>{t("deleteDialog.moveTo")}</Label>
            <CategoryPicker categories={categories} value={targetId} onChange={setTargetId} allowNone variant="outline" className="h-9 w-full justify-between" />
            <p className="text-xs text-muted-foreground">{target ? t("deleteDialog.moveHint", { name: target.name }) : t("deleteDialog.uncategorizeHint")}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button variant="destructive" onClick={remove} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {target ? t("deleteDialog.confirmMove") : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
