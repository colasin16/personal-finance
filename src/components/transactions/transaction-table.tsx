"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BankLogo } from "@/components/brand/bank-logo";
import { ArrowLeftRight, FileText, Flag, History, Link2Off, Loader2, RotateCcw, Sparkles, StickyNote, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { excludeTransactionsAction, getTransactionHistoryAction, restoreTransactionsAction, setCategoryAction, setNotesAction, unlinkTransferAction } from "@/lib/actions/transactions";
import { FLAG_CODES, formatDate, isCategorizedBy } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { intlLocale } from "@/i18n/config";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CategoryLabel, UNCATEGORIZED_COLOR } from "./category-label";
import { CategoryPicker, type CategoryOption } from "./category-picker";
import { RuleDialog } from "./rule-dialog";
import type { RuleInput } from "@/lib/actions/transactions";
import type { TxItem } from "./tx-item";

const isFlagCode = (s: string): s is (typeof FLAG_CODES)[number] => FLAG_CODES.includes(s as (typeof FLAG_CODES)[number]);

/** flag_reason holds a FLAG_CODES code (older rows may still hold raw English text). */
function useFlagReason() {
  const tc = useTranslations("common");
  return (reason: string) => (isFlagCode(reason) ? tc(`flags.${reason}`) : reason);
}

export function TransactionTable({
  rows,
  categories,
  showAccount = true,
  showBalance = false,
  emptyMessage,
}: {
  rows: TxItem[];
  categories: CategoryOption[];
  showAccount?: boolean;
  showBalance?: boolean;
  emptyMessage?: string;
}) {
  const t = useTranslations("transactions.table");
  const locale = useLocale();
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
        toast.success(t("categorizedAs", { category: category.name }), {
          description: t("suggestRule", { merchant, category: category.name }),
          action: { label: t("createRule"), onClick: () => setRule({ matchType: "merchant", pattern: merchant, categoryId: category.id }) },
          duration: 8000,
        });
      } else {
        toast.success(t("updated", { count: result.data.updated }));
      }
    });

  const setExcluded = (ids: string[], excluded: boolean) =>
    start(async () => {
      const result = await (excluded ? excludeTransactionsAction(ids) : restoreTransactionsAction(ids));
      if (!result.ok) return void toast.error(result.error);
      setSelected(new Set());
      setDetail(null);
      toast.success(t(excluded ? "removed" : "restored", { count: result.data.updated }));
    });

  const allSelected = optimistic.length > 0 && optimistic.every((r) => selected.has(r.id));
  const allExcluded = selected.size > 0 && optimistic.filter((r) => selected.has(r.id)).every((r) => r.excluded);
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
          <span className="text-sm font-medium">{t("selected", { count: selected.size })}</span>
          <CategoryPicker
            categories={categories}
            value={null}
            onChange={(categoryId) => setCategory([...selected], categoryId)}
            placeholder={t("setCategory")}
            variant="outline"
            allowNone
            disabled={pending}
          />
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setExcluded([...selected], !allExcluded)}>
            {allExcluded ? <RotateCcw /> : <Trash2 />} {allExcluded ? t("restore") : t("remove")}
          </Button>
          {pending && <Loader2 className="size-4 animate-spin" />}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>
            <X /> {t("clear")}
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
                  aria-label={t("selectAll")}
                />
              </TableHead>
              <TableHead className="w-28">{t("date")}</TableHead>
              <TableHead>{t("description")}</TableHead>
              {showAccount && <TableHead className="hidden lg:table-cell">{t("account")}</TableHead>}
              <TableHead className="w-52">{t("category")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
              {showBalance && <TableHead className="hidden text-right md:table-cell">{t("balance")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {optimistic.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  {emptyMessage ?? t("empty")}
                </TableCell>
              </TableRow>
            )}
            {optimistic.map((r) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined} className={cn(r.flagged && "bg-amber-50/60 dark:bg-amber-950/20", r.excluded && "opacity-60 line-through")}>
                <TableCell>
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={(c) => toggle(r.id, c === true)} aria-label={t("selectRow")} />
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{formatDate(r.bookedAt, locale)}</TableCell>
                <TableCell className="max-w-0 w-full">
                  <button className="block w-full min-w-0 text-left" onClick={() => setDetail(r)}>
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{r.merchant || r.descriptionRaw}</span>
                      {r.transferGroupId && <ArrowLeftRight className="size-3.5 shrink-0 text-sky-600" aria-label={t("linkedTransfer")} />}
                      {r.notes && <StickyNote className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("hasNotes")} />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{r.descriptionRaw}</span>
                  </button>
                </TableCell>
                {showAccount && (
                  <TableCell className="hidden text-sm whitespace-nowrap lg:table-cell">
                    <div className="flex items-center gap-1.5">
                      <BankLogo bankId={r.bankId} name={r.bankName} color={r.bankColor} size={20} className="rounded-[22%]" />
                      {r.accountName}
                    </div>
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
          onToggleExcluded={() => setExcluded([detail.id], !detail.excluded)}
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
  const t = useTranslations("transactions.table");
  const tc = useTranslations("common");
  const flagReason = useFlagReason();
  if (tx.flagged) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Flag className="size-3.5 shrink-0 text-amber-600" aria-label={t("needsAttention")} />
        </TooltipTrigger>
        <TooltipContent>{tx.flagReason ? flagReason(tx.flagReason) : t("checkCategory")}</TooltipContent>
      </Tooltip>
    );
  }
  if (tx.categorizedBy === "llm" || tx.categorizedBy === "merchant" || tx.categorizedBy === "rule") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Sparkles className="size-3.5 shrink-0 text-violet-500" aria-label={t("autoCategorized")} />
        </TooltipTrigger>
        <TooltipContent>
          {tc(`categorizedBy.${tx.categorizedBy}`)}
          {tx.categorizedBy === "llm" && tx.categoryConfidence !== null && ` · ${t("confidence", { percent: Math.round(tx.categoryConfidence * 100) })}`}
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
  onToggleExcluded,
  onCreateRule,
}: {
  tx: TxItem;
  category?: CategoryOption;
  categories: CategoryOption[];
  onClose: () => void;
  onToggleExcluded: () => void;
  onCreateRule: () => void;
}) {
  const t = useTranslations("transactions.detail");
  const tc = useTranslations("common");
  const locale = useLocale();
  const flagReason = useFlagReason();
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [history, setHistory] = useState<Change[] | null>(null);
  const [pending, start] = useTransition();
  const catName = (id: string | null) => (id ? (categories.find((c) => c.id === id)?.name ?? t("deletedCategory")) : tc("uncategorized"));
  const fieldLabel = (field: string) => (field === "category" || field === "notes" || field === "excluded" ? t(`fields.${field}`) : field);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6">{tx.merchant || tx.descriptionRaw}</DialogTitle>
          <DialogDescription>
            {formatDate(tx.bookedAt, locale)} · {tx.accountName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <span className="flex items-center gap-2">
              <CategoryLabel name={category?.name ?? tc("uncategorized")} icon={category?.icon} color={category?.color ?? UNCATEGORIZED_COLOR} />
              {isCategorizedBy(tx.categorizedBy) && <Badge variant="outline">{tc(`categorizedBy.${tx.categorizedBy}`)}</Badge>}
            </span>
            <Money cents={tx.amountCents} currency={tx.currency} colored className="text-base font-semibold" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("originalDescription")}</p>
            <p className="font-mono text-xs break-all">{tx.descriptionRaw}</p>
          </div>
          {tx.flagged && tx.flagReason && <p className="rounded-md bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{flagReason(tx.flagReason)}</p>}
          <div className="space-y-1.5">
            <label htmlFor="tx-notes" className="text-xs text-muted-foreground">
              {t("notes")}
            </label>
            <Textarea id="tx-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} placeholder={t("notesPlaceholder")} />
          </div>
          {history === null ? (
            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => start(async () => setHistory(await getTransactionHistoryAction(tx.id)))}>
              <History className="size-3" /> {t("showHistory")}
            </Button>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noHistory")}</p>
          ) : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {history.map((h) => (
                <li key={h.id}>
                  {new Date(h.createdAt).toLocaleString(intlLocale(locale))} — {fieldLabel(h.field)}:{" "}
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
                  <FileText /> {t("sourcePdf")}
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={pending} onClick={onToggleExcluded}>
              {tx.excluded ? <RotateCcw /> : <Trash2 />} {tx.excluded ? t("restore") : t("remove")}
            </Button>
            <Button variant="outline" size="sm" onClick={onCreateRule}>
              <Wand2 /> {t("rule")}
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
                      toast.success(t("transferUnlinked"));
                      onClose();
                    } else toast.error(r.error);
                  })
                }
              >
                <Link2Off /> {t("unlinkTransfer")}
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
                  toast.success(t("notesSaved"));
                  onClose();
                } else toast.error(r.error);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} {t("saveNotes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

