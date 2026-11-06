"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeftRight,
  ArrowRight,
  FileText,
  History,
  Link2,
  Link2Off,
  Loader2,
  Pencil,
  RotateCcw,
  StickyNote,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getTransactionHistoryAction,
  setNotesAction,
  unlinkTransferAction,
} from "@/lib/actions/transactions";
import { formatDate, isCategorizedBy } from "@/lib/labels";
import { intlLocale } from "@/i18n/config";
import { AccountRef } from "@/components/accounts/account-ref";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CategoryLabel, UNCATEGORIZED_COLOR } from "./category-label";
import type { CategoryOption } from "./category-picker";
import { LinkTransferPicker } from "./link-transfer-picker";
import { useFlagReason } from "./source-icon";
import type { TxItem } from "./tx-item";

type Change = Awaited<ReturnType<typeof getTransactionHistoryAction>>[number];

export function TransactionDetail({
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
  const tr = useTranslations("transactions.rule");
  const tc = useTranslations("common");
  const locale = useLocale();
  const flagReason = useFlagReason();
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [history, setHistory] = useState<Change[] | null>(null);
  const [linking, setLinking] = useState(false);
  const [pending, start] = useTransition();
  const catName = (id: string | null) =>
    id
      ? (categories.find((c) => c.id === id)?.name ?? t("deletedCategory"))
      : tc("uncategorized");
  const fieldLabel = (field: string) =>
    field === "category" || field === "notes" || field === "excluded"
      ? t(`fields.${field}`)
      : field;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6">
            {tx.merchant || tx.descriptionRaw}
          </DialogTitle>
          <DialogDescription className="flex min-w-0 items-center gap-1">
            <span className="shrink-0">
              {formatDate(tx.bookedAt, locale)} ·
            </span>
            <AccountRef account={tx.account} size="md" className="min-w-0" />
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-2 rounded-lg bg-muted p-3">
            <Money
              cents={tx.amountCents}
              currency={tx.currency}
              colored
              className="block text-2xl font-semibold tabular-nums"
            />
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <CategoryLabel
                name={category?.name ?? tc("uncategorized")}
                icon={category?.icon}
                color={category?.color ?? UNCATEGORIZED_COLOR}
              />
              {isCategorizedBy(tx.categorizedBy) && (
                <Badge variant="outline">
                  {tc(`categorizedBy.${tx.categorizedBy}`)}
                </Badge>
              )}
            </span>
          </div>
          {linking && (
            <LinkTransferPicker
              transactionId={tx.id}
              amountCents={tx.amountCents}
              onCancel={() => setLinking(false)}
              onLinked={onClose}
            />
          )}
          {tx.linked.length > 0 && (
            <div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeftRight className="size-3 text-sky-600" />{" "}
                {t("linkedTo")}
              </p>
              <ul className="mt-1 space-y-1.5">
                {tx.linked.map((l) =>
                  l.hidden ? (
                    <li key={l.id} className="text-muted-foreground">
                      {t("linkedHidden")}
                    </li>
                  ) : (
                    <li
                      key={l.id}
                      className="flex items-center gap-3 rounded-lg border p-2.5"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <AccountRef account={l.account} className="max-w-full" />
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(l.bookedAt, locale)} · {l.description}
                          {l.removed && ` · ${t("linkedRemoved")}`}
                        </p>
                      </div>
                      <Money
                        cents={l.amountCents}
                        currency={l.currency}
                        colored
                        className="shrink-0 font-medium"
                      />
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                      >
                        <Link
                          href={`/transactions?${new URLSearchParams({ account: l.accountId, from: l.bookedAt, to: l.bookedAt, ...(l.removed ? { removed: "1" } : {}) })}`}
                          aria-label={t("viewLinked")}
                          title={t("viewLinked")}
                          onClick={onClose}
                        >
                          <ArrowRight />
                        </Link>
                      </Button>
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">
              {t("originalDescription")}
            </p>
            <p className="font-mono text-xs break-all">{tx.descriptionRaw}</p>
          </div>
          {(tx.rule || tx.categorizedBy === "rule") && (
            <div>
              <p className="text-xs text-muted-foreground">{t("appliedRule")}</p>
              {tx.rule ? (
                <a href="/settings/rules" className="hover:underline">
                  {tr(`matchTypes.${tx.rule.matchType}`)}{" "}
                  <span className="font-mono text-xs">“{tx.rule.pattern}”</span> →{" "}
                  {catName(tx.rule.categoryId)}
                </a>
              ) : (
                <p className="text-muted-foreground">{t("ruleUnknown")}</p>
              )}
            </div>
          )}
          {tx.flagged && tx.flagReason && (
            <p className="rounded-md bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {flagReason(tx.flagReason)}
            </p>
          )}
          {(editingNotes || tx.notes) && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <label
                  htmlFor="tx-notes"
                  className="text-xs text-muted-foreground"
                >
                  {t("notes")}
                </label>
                {!editingNotes && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={t("editNote")}
                    title={t("editNote")}
                    onClick={() => setEditingNotes(true)}
                  >
                    <Pencil className="size-3" />
                  </Button>
                )}
              </div>
              {editingNotes ? (
                <Textarea
                  id="tx-notes"
                  autoFocus
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder={t("notesPlaceholder")}
                />
              ) : (
                <p className="break-words whitespace-pre-wrap">{tx.notes}</p>
              )}
            </div>
          )}
          {history === null ? (
            <Button
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() =>
                start(async () =>
                  setHistory(await getTransactionHistoryAction(tx.id)),
                )
              }
            >
              <History className="size-3" /> {t("showHistory")}
            </Button>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noHistory")}</p>
          ) : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {history.map((h) => (
                <li key={h.id}>
                  {new Date(h.createdAt).toLocaleString(intlLocale(locale))} —{" "}
                  {fieldLabel(h.field)}:{" "}
                  {h.field === "category"
                    ? `${catName(h.oldValue)} → ${catName(h.newValue)}`
                    : `“${h.oldValue ?? ""}” → “${h.newValue ?? ""}”`}
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {tx.statementId && (
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/api/statements/${tx.statementId}/file`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText /> {t("sourcePdf")}
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={onToggleExcluded}
            >
              {tx.excluded ? <RotateCcw /> : <Trash2 />}{" "}
              {tx.excluded ? t("restore") : t("remove")}
            </Button>
            <Button variant="outline" size="sm" onClick={onCreateRule}>
              <Wand2 /> {t("rule")}
            </Button>
            {!tx.transferGroupId && !tx.excluded && !linking && (
              <Button variant="outline" size="sm" onClick={() => setLinking(true)}>
                <Link2 /> {t("linkTransfer")}
              </Button>
            )}
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
            {!tx.notes && !editingNotes && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingNotes(true)}
              >
                <StickyNote /> {t("addNote")}
              </Button>
            )}
          </div>
          {editingNotes && (
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
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
