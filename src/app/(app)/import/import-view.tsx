"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, FileText, FileUp, Loader2, MoreHorizontal, Plus, RotateCw, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { DetectedStatementInfo } from "@/lib/db/schema";
import type { StatementStatus } from "@/app/api/statements/status/route";
import { assignStatementAccountAction, deleteStatementAction, retryStatementAction } from "@/lib/actions/statements";
import { translateError } from "@/i18n/errors";
import { isStaleProcessing, isInProgress as inProgress } from "@/lib/statement-processing";
import { formatDate, formatMonth, STATEMENT_STATUSES } from "@/lib/labels";
import { filterStatements, groupStatements, isMonthParam, statementMonths } from "@/lib/statement-groups";
import { cn } from "@/lib/utils";
import { AccountRef, type AccountRefData } from "@/components/accounts/account-ref";
import { AccountDialog, type BankOption, type MemberOption } from "@/components/accounts/account-dialog";
import { useUpload } from "@/components/shell/upload-provider";
import { StatusBadge } from "@/components/statements/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type StatementItem = {
  id: string;
  fileName: string;
  status: string;
  progress: string | null;
  progressAt: string;
  error: string | null;
  accountId: string | null;
  account: AccountRefData | null;
  periodStart: string | null;
  periodEnd: string | null;
  issues: number;
  detected: DetectedStatementInfo | null;
};

type AccountOption = AccountRefData & { id: string };

const AUTO = "auto";
const ALL = "all";
const POLL_MS = 2000;

export function ImportView({
  accounts,
  banks,
  members,
  currentUserId,
  statements,
}: {
  accounts: AccountOption[];
  banks: BankOption[];
  members: MemberOption[];
  currentUserId: string;
  statements: StatementItem[];
}) {
  const t = useTranslations("import");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { upload, uploading } = useUpload();
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState(AUTO);
  const [over, setOver] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState<Record<string, StatementStatus>>({});
  const pendingKey = statements
    .filter((s) => inProgress(s.status))
    .map((s) => s.id)
    .join(",");

  // Poll a small status endpoint while statements process, and re-render the page only once one finishes.
  // (Refreshing the whole page on a timer queued up server renders and made the app unresponsive.)
  useEffect(() => {
    if (!pendingKey) return;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const tick = async () => {
      setNow(Date.now());
      try {
        const res = await fetch(`/api/statements/status?ids=${pendingKey}`, { signal: controller.signal, cache: "no-store" });
        if (res.ok) {
          const { statuses } = (await res.json()) as { statuses: StatementStatus[] };
          setLive(Object.fromEntries(statuses.map((s) => [s.id, s])));
          if (statuses.some((s) => !inProgress(s.status))) return router.refresh();
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pendingKey, router]);

  const month = isMonthParam(params.get("month")) ? params.get("month")! : undefined;
  const accountId = params.get("account") ?? undefined;
  const status = params.get("status") ?? undefined;
  const filtering = !!(month || accountId || status);
  const setFilter = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const current = statements.map((s) => ({ ...s, ...(inProgress(s.status) ? live[s.id] : undefined) }));
  const groups = groupStatements(filterStatements(current, { month, accountId, status }), month);
  const months = statementMonths(statements);
  if (month && !months.includes(month)) months.unshift(month);
  const accountOptions = [...new Map(statements.flatMap((s) => (s.accountId && s.account ? [[s.accountId, s.account] as const] : []))).entries()].sort(
    ([, a], [, b]) => a.name.localeCompare(b.name),
  );

  const send = (files: FileList | null) => {
    if (files?.length) void upload(Array.from(files), target === AUTO ? null : target);
  };

  return (
    <>
      <div
        data-dropzone
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          send(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-background px-6 py-12 text-center transition-colors",
          over ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-muted-foreground/25",
        )}
      >
        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          {uploading ? <Loader2 className="size-7 animate-spin" /> : <FileUp className="size-7" />}
        </div>
        <div>
          <p className="text-lg font-medium">{t("dropzone.title")}</p>
          <p className="text-sm text-muted-foreground">{t("dropzone.hint")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => input.current?.click()} disabled={uploading} className="bg-emerald-600 hover:bg-emerald-700">
            {t("dropzone.chooseFiles")}
          </Button>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-64 [&>span]:min-w-0" aria-label={t("dropzone.accountLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>{t("dropzone.autoDetect")}</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <AccountRef account={a} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            send(e.target.files);
            e.target.value = "";
          }}
        />
        {accounts.length === 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {t.rich("dropzone.tip", {
              link: (chunks) => (
                <Link href="/accounts" className="underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}
      </div>

      {statements.length > 0 && (
        <div className="-mb-3 flex flex-wrap items-center gap-2">
          <Select value={month ?? ALL} onValueChange={(v) => setFilter({ month: v === ALL ? null : v })}>
            <SelectTrigger className="w-44" aria-label={t("filters.month")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.allMonths")}</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonth(m, "long", locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountId ?? ALL} onValueChange={(v) => setFilter({ account: v === ALL ? null : v })}>
            <SelectTrigger className="w-56 [&>span]:min-w-0" aria-label={t("filters.account")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.allAccounts")}</SelectItem>
              {accountOptions.map(([id, account]) => (
                <SelectItem key={id} value={id}>
                  <AccountRef account={account} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status ?? ALL} onValueChange={(v) => setFilter({ status: v === ALL ? null : v })}>
            <SelectTrigger className="w-44" aria-label={t("filters.status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.allStatuses")}</SelectItem>
              {STATEMENT_STATUSES.map((st) => (
                <SelectItem key={st} value={st}>
                  {tc(`statementStatus.${st}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtering && (
            <Button variant="ghost" size="sm" onClick={() => setFilter({ month: null, account: null, status: null })}>
              <X /> {t("filters.reset")}
            </Button>
          )}
        </div>
      )}

      <Card id="statements" className="scroll-mt-4 py-0">
        <CardContent className="p-0">
          {statements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <FileText className="size-8" />
              {t("empty")}
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <FileText className="size-8" />
              {t("filters.noMatches")}
            </div>
          ) : (
            <div className="divide-y">
              {groups.map((g) => {
                const key = g.month ?? "undated";
                // Fully confirmed months start collapsed, unless the list is filtered down to them.
                const open = toggled[key] ?? (filtering || !g.allConfirmed);
                return (
                  <section key={key}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setToggled((prev) => ({ ...prev, [key]: !open }))}
                      className="flex w-full items-center gap-2 bg-muted/40 px-4 py-2 text-left text-sm hover:bg-muted/70"
                    >
                      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                      <span className="font-medium">{g.month ? formatMonth(g.month, "long", locale) : t("groups.undated")}</span>
                      <span className="text-muted-foreground">· {tc("statementsCount", { count: g.items.length })}</span>
                      {g.allConfirmed && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" /> {t("groups.allConfirmed")}
                        </span>
                      )}
                    </button>
                    {open && (
                      <ul className="divide-y border-t">
                        {g.items.map((s) => (
                          <StatementRow
                            key={s.id}
                            statement={s}
                            accounts={accounts}
                            banks={banks}
                            members={members}
                            currentUserId={currentUserId}
                            stuck={isStaleProcessing(s, now)}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function StatementRow({
  statement: s,
  accounts,
  banks,
  members,
  currentUserId,
  stuck,
}: {
  statement: StatementItem;
  accounts: AccountOption[];
  banks: BankOption[];
  members: MemberOption[];
  currentUserId: string;
  stuck: boolean;
}) {
  const t = useTranslations("import");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error);
      else if (success) toast.success(success);
    });
  const assign = (accountId: string) => run(() => assignStatementAccountAction(s.id, accountId), t("toasts.assigned"));
  const detectedBank = banks.find((b) => b.id === s.detected?.bankId);

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{s.fileName}</p>
          <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
            {s.account ? (
              <AccountRef account={s.account} />
            ) : (
              <span>
                {detectedBank ? t("row.detected", { bank: detectedBank.name }) : t("row.notDetected")}
                {s.detected?.ibanLast4 && ` · ${t("row.iban", { last4: s.detected.ibanLast4 })}`}
              </span>
            )}
            {s.periodStart && s.periodEnd && <span>· {formatDate(s.periodStart, locale)} – {formatDate(s.periodEnd, locale)}</span>}
          </p>
          {s.status === "failed" && s.error && <p className="mt-1 text-xs text-red-600">{translateError(te, s.error)}</p>}
          {stuck && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t("row.stuck")}</p>}
          {s.status === "needs_review" && s.issues > 0 && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t("row.balanceIssues", { count: s.issues })}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        {s.status === "needs_account" ? (
          <>
            <Select onValueChange={assign} disabled={pending}>
              <SelectTrigger className="w-56 [&>span]:min-w-0" size="sm">
                <SelectValue placeholder={t("row.whichAccount")} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <AccountRef account={a} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus /> {t("row.new")}
            </Button>
          </>
        ) : (
          <StatusBadge status={s.status} progress={s.progress} />
        )}
        {(s.status === "needs_review" || s.status === "confirmed") && (
          <Button asChild size="sm" variant={s.status === "needs_review" ? "default" : "ghost"}>
            <Link href={`/statements/${s.id}`}>
              {s.status === "needs_review" ? tc("actions.review") : tc("actions.open")} <ArrowRight />
            </Link>
          </Button>
        )}
        {(s.status === "failed" || stuck) && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryStatementAction(s.id), t("toasts.retrying"))}>
            {pending ? <Loader2 className="animate-spin" /> : <RotateCw />} {tc("actions.retry")}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" aria-label={t("row.moreActions")}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={`/api/statements/${s.id}/file`} target="_blank" rel="noreferrer">
                <FileText /> {t("row.viewPdf")}
              </a>
            </DropdownMenuItem>
            {s.status !== "confirmed" && s.status !== "needs_account" && (
              <DropdownMenuItem onSelect={() => run(() => retryStatementAction(s.id), t("toasts.reprocessing"))}>
                <RotateCw /> {t("row.reprocess")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmingDelete(true)}
            >
              <Trash2 /> {tc("actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirmingDelete} onOpenChange={(o) => !pending && setConfirmingDelete(o)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("row.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("row.confirmDelete", { fileName: s.fileName })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setConfirmingDelete(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                run(() => deleteStatementAction(s.id), t("toasts.deleted"));
                setConfirmingDelete(false);
              }}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} {tc("actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {creating && (
        <AccountDialog
          open
          onOpenChange={setCreating}
          banks={banks}
          members={members}
          currentUserId={currentUserId}
          initial={{ bankId: s.detected?.bankId ?? undefined, name: detectedBank ? t("row.newAccountName", { bank: detectedBank.name }) : "" }}
          hint={
            s.detected?.ibanLast4
              ? t("row.ibanHint", { last4: s.detected.ibanLast4 })
              : undefined
          }
          onSaved={assign}
        />
      )}
    </li>
  );
}
