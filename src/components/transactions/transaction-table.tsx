"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ArrowLeftRight, FileText, Flag, History, Link2Off, Loader2, Sparkles, StickyNote, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { getTransactionHistoryAction, setCategoryAction, setNotesAction, unlinkTransferAction } from "@/lib/actions/transactions";
import { CATEGORIZED_BY, formatDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CategoryDot, CategoryPicker, type CategoryOption } from "./category-picker";
import { RuleDialog } from "./rule-dialog";
import type { RuleInput } from "@/lib/actions/transactions";
import type { TxItem } from "./tx-item";


export function TransactionTable({
  rows,
  categories,
  showAccount = true,
  showBalance = false,
  emptyMessage = "No transactions match these filters.",
}: {
  rows: TxItem[];
  categories: CategoryOption[];
  showAccount?: boolean;
  showBalance?: boolean;
  emptyMessage?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rule, setRule] = useState<Partial<RuleInput> | null>(null);
  const [detail, setDetail] = useState<TxItem | null>(null);
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(rows, (state, update: { ids: string[]; categoryId: string | null }) =>
    state.map((r) => (update.ids.includes(r.id) ? { ...r, categoryId: update.categoryId, categorizedBy: "user", flagged: false } : r)),
  );
  const catBy = new Map(categories.map((c) => [c.id, c]));

  const setCategory = (ids: string[], categoryId: string | null) =>
    start(async () => {
      setOptimistic({ ids, categoryId });
      const result = await setCategoryAction(ids, categoryId);
      if (!result.ok) return void toast.error(result.error);
      setSelected(new Set());
      const source = rows.find((r) => r.id === ids[0]);
      const merchant = source?.merchant;
      const category = categoryId ? catBy.get(categoryId) : null;
      if (ids.length === 1 && merchant && category) {
        toast.success(`Categorized as ${category.name}`, {
          description: `Always categorize “${merchant}” as ${category.name}?`,
          action: { label: "Create rule", onClick: () => setRule({ matchType: "merchant", pattern: merchant, categoryId: category.id }) },
          duration: 8000,
        });
      } else {
        toast.success(`${result.data.updated} transaction${result.data.updated === 1 ? "" : "s"} updated`);
      }
    });

  const allSelected = optimistic.length > 0 && optimistic.every((r) => selected.has(r.id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  return (
    <div className="relative">
      {selected.size > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-background p-2 pl-4 shadow-md">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <CategoryPicker
            categories={categories}
            value={null}
            onChange={(categoryId) => setCategory([...selected], categoryId)}
            placeholder="Set category…"
            variant="outline"
            allowNone
            disabled={pending}
          />
          {pending && <Loader2 className="size-4 animate-spin" />}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>
            <X /> Clear
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) => setSelected(c === true ? new Set(optimistic.map((r) => r.id)) : new Set())}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Description</TableHead>
              {showAccount && <TableHead className="hidden lg:table-cell">Account</TableHead>}
              <TableHead className="w-52">Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {showBalance && <TableHead className="hidden text-right md:table-cell">Balance</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {optimistic.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {optimistic.map((r) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined} className={cn(r.flagged && "bg-amber-50/60 dark:bg-amber-950/20")}>
                <TableCell>
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={(c) => toggle(r.id, c === true)} aria-label="Select transaction" />
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{formatDate(r.bookedAt)}</TableCell>
                <TableCell className="max-w-0 w-full">
                  <button className="block w-full min-w-0 text-left" onClick={() => setDetail(r)}>
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{r.merchant || r.descriptionRaw}</span>
                      {r.transferGroupId && <ArrowLeftRight className="size-3.5 shrink-0 text-sky-600" aria-label="Linked transfer" />}
                      {r.notes && <StickyNote className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has notes" />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{r.descriptionRaw}</span>
                  </button>
                </TableCell>
                {showAccount && (
                  <TableCell className="hidden text-sm whitespace-nowrap lg:table-cell">
                    <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: r.bankColor }} />
                    {r.accountName}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-1">
                    <CategoryPicker categories={categories} value={r.categoryId} onChange={(id) => setCategory([r.id], id)} allowNone />
                    <SourceIcon tx={r} />
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium whitespace-nowrap">
                  <Money cents={r.amountCents} currency={r.currency} colored />
                </TableCell>
                {showBalance && (
                  <TableCell className="hidden text-right text-sm whitespace-nowrap text-muted-foreground md:table-cell">
                    {r.balanceAfterCents !== null && <Money cents={r.balanceAfterCents} currency={r.currency} />}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {rule && <RuleDialog open onOpenChange={(o) => !o && setRule(null)} categories={categories} initial={rule} />}
      {detail && (
        <TransactionDetail
          tx={detail}
          category={detail.categoryId ? catBy.get(detail.categoryId) : undefined}
          categories={categories}
          onClose={() => setDetail(null)}
          onCreateRule={() => {
            setRule({ matchType: "merchant", pattern: detail.merchant ?? detail.descriptionRaw, categoryId: detail.categoryId ?? undefined });
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}

function SourceIcon({ tx }: { tx: TxItem }) {
  if (tx.flagged) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Flag className="size-3.5 shrink-0 text-amber-600" aria-label="Needs attention" />
        </TooltipTrigger>
        <TooltipContent>{tx.flagReason ?? "Please check this category"}</TooltipContent>
      </Tooltip>
    );
  }
  if (tx.categorizedBy === "llm" || tx.categorizedBy === "merchant" || tx.categorizedBy === "rule") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Sparkles className="size-3.5 shrink-0 text-violet-500" aria-label="Automatically categorized" />
        </TooltipTrigger>
        <TooltipContent>
          {CATEGORIZED_BY[tx.categorizedBy]}
          {tx.categorizedBy === "llm" && tx.categoryConfidence !== null && ` · ${Math.round(tx.categoryConfidence * 100)}% confident`}
        </TooltipContent>
      </Tooltip>
    );
  }
  return null;
}

type Change = Awaited<ReturnType<typeof getTransactionHistoryAction>>[number];

function TransactionDetail({
  tx,
  category,
  categories,
  onClose,
  onCreateRule,
}: {
  tx: TxItem;
  category?: CategoryOption;
  categories: CategoryOption[];
  onClose: () => void;
  onCreateRule: () => void;
}) {
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [history, setHistory] = useState<Change[] | null>(null);
  const [pending, start] = useTransition();
  const catName = (id: string | null) => (id ? (categories.find((c) => c.id === id)?.name ?? "Deleted category") : "Uncategorized");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6">{tx.merchant || tx.descriptionRaw}</DialogTitle>
          <DialogDescription>
            {formatDate(tx.bookedAt)} · {tx.accountName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <span className="flex items-center gap-2">
              <CategoryDot color={category?.color ?? "#f59e0b"} />
              {category?.name ?? "Uncategorized"}
              {tx.categorizedBy && <Badge variant="outline">{CATEGORIZED_BY[tx.categorizedBy]}</Badge>}
            </span>
            <Money cents={tx.amountCents} currency={tx.currency} colored className="text-base font-semibold" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Original description</p>
            <p className="font-mono text-xs break-all">{tx.descriptionRaw}</p>
          </div>
          {tx.flagged && tx.flagReason && <p className="rounded-md bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{tx.flagReason}</p>}
          <div className="space-y-1.5">
            <label htmlFor="tx-notes" className="text-xs text-muted-foreground">
              Notes (visible to your household)
            </label>
            <Textarea id="tx-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} placeholder="e.g. Dinner with friends — they paid back half" />
          </div>
          {history === null ? (
            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => start(async () => setHistory(await getTransactionHistoryAction(tx.id)))}>
              <History className="size-3" /> Show change history
            </Button>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No manual changes yet.</p>
          ) : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {history.map((h) => (
                <li key={h.id}>
                  {new Date(h.createdAt).toLocaleString("en-GB")} — {h.field}:{" "}
                  {h.field === "category" ? `${catName(h.oldValue)} → ${catName(h.newValue)}` : `“${h.oldValue ?? ""}” → “${h.newValue ?? ""}”`}
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {tx.statementId && (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/statements/${tx.statementId}/file`} target="_blank" rel="noreferrer">
                  <FileText /> Source PDF
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onCreateRule}>
              <Wand2 /> Rule
            </Button>
            {tx.transferGroupId && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await unlinkTransferAction(tx.id);
                    if (r.ok) {
                      toast.success("Transfer unlinked");
                      onClose();
                    } else toast.error(r.error);
                  })
                }
              >
                <Link2Off /> Unlink transfer
              </Button>
            )}
          </div>
          <Button
            size="sm"
            disabled={pending || notes === (tx.notes ?? "")}
            onClick={() =>
              start(async () => {
                const r = await setNotesAction(tx.id, notes);
                if (r.ok) {
                  toast.success("Notes saved");
                  onClose();
                } else toast.error(r.error);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Save notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

