"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, FilePlus, FileText, FileUp, Loader2, Plus, RotateCw, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { DetectedStatementInfo } from "@/lib/db/schema";
import type { StatementStatus } from "@/app/api/statements/status/route";
import { assignStatementAccountAction, deleteStatementAction, retryStatementAction } from "@/lib/actions/statements";
import { translateError } from "@/i18n/errors";
import { isStaleProcessing, isInProgress as inProgress } from "@/lib/statement-processing";
import { formatDate, formatMonth } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { AccountRef, type AccountRefData } from "@/components/accounts/account-ref";
import { AccountDialog, type BankOption, type MemberOption } from "@/components/accounts/account-dialog";
import { useUpload } from "@/components/shell/upload-provider";
import { StatusBadge } from "@/components/statements/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

/** The selected month: one slot per active account (its statements, or a gap), plus statements of other accounts. */
type MonthBrowser = {
  month: string;
  prev: string | null;
  next: string | null;
  slots: { account: AccountOption; statements: StatementItem[]; missing: boolean }[];
  others: StatementItem[];
};

const AUTO = "auto";
const POLL_MS = 2000;

export function ImportView({
  accounts,
  banks,
  members,
  currentUserId,
  attention,
  browser,
  coverage,
}: {
  accounts: AccountOption[];
  banks: BankOption[];
  members: MemberOption[];
  currentUserId: string;
  attention: StatementItem[];
  browser: MonthBrowser | null;
  coverage: ReactNode;
}) {
  const t = useTranslations("import");
  const locale = useLocale();
  const router = useRouter();
  const { upload, uploading } = useUpload();
  const [target, setTarget] = useState(AUTO);
  const [over, setOver] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  // Account picked from a month row's "Upload" button; overrides the dropzone's account selector for that pick.
  const uploadFor = useRef<string | null>(null);
  const [live, setLive] = useState<Record<string, StatementStatus>>({});
  const pendingKey = attention
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

  const send = (files: FileList | null, accountId = target === AUTO ? null : target) => {
    if (files?.length) void upload(Array.from(files), accountId);
  };
  const pick = (accountId: string | null) => {
    uploadFor.current = accountId;
    input.current?.click();
  };
  const withLive = (s: StatementItem) => ({ ...s, ...(inProgress(s.status) ? live[s.id] : undefined) });
  const row = (s: StatementItem) => (
    <StatementRow
      key={s.id}
      statement={withLive(s)}
      accounts={accounts}
      banks={banks}
      members={members}
      currentUserId={currentUserId}
      stuck={isStaleProcessing(withLive(s), now)}
    />
  );
  const confirmed = browser?.slots.filter((slot) => slot.statements.some((s) => s.status === "confirmed")).length ?? 0;

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
          <Button onClick={() => pick(null)} disabled={uploading} className="bg-emerald-600 hover:bg-emerald-700">
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
            send(e.target.files, uploadFor.current ?? undefined);
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

      {attention.length > 0 && (
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle>{t("attention.title", { count: attention.length })}</CardTitle>
            <CardDescription>{t("attention.description")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">{attention.map(row)}</ul>
          </CardContent>
        </Card>
      )}

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b">
          <CardTitle>{t("coverage.title")}</CardTitle>
          <CardDescription>{t("coverage.description")}</CardDescription>
        </CardHeader>
        <CardContent className={cn("py-4", browser && "border-b")}>{coverage}</CardContent>
        {browser && (
          <section aria-labelledby="statements-month">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-2 py-2">
              <div className="flex items-center">
                <MonthLink month={browser.prev} label={t("months.previous")}>
                  <ChevronLeft />
                </MonthLink>
                <h2 id="statements-month" className="min-w-36 text-center text-sm font-medium">
                  {formatMonth(browser.month, "long", locale)}
                </h2>
                <MonthLink month={browser.next} label={t("months.next")}>
                  <ChevronRight />
                </MonthLink>
              </div>
              <span className="text-xs text-muted-foreground">{t("months.summary", { done: confirmed, total: browser.slots.length })}</span>
            </div>
            <ul className="divide-y">
              {browser.slots.flatMap(({ account, statements, missing }) =>
                statements.length ? statements.map(row) : [<GapRow key={account.id} account={account} missing={missing} onUpload={() => pick(account.id)} disabled={uploading} />],
              )}
              {browser.others.map(row)}
            </ul>
          </section>
        )}
      </Card>
    </>
  );
}

function MonthLink({ month, label, children }: { month: string | null; label: string; children: ReactNode }) {
  if (!month)
    return (
      <Button size="icon" variant="ghost" className="size-8" disabled aria-label={label}>
        {children}
      </Button>
    );
  return (
    <Button asChild size="icon" variant="ghost" className="size-8">
      <Link href={`/import?month=${month}`} scroll={false} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}

/** A month with no statement for this account — a gap after its first statement, or simply not tracked yet. */
function GapRow({ account, missing, onUpload, disabled }: { account: AccountOption; missing: boolean; onUpload: () => void; disabled: boolean }) {
  const t = useTranslations("import");
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <FilePlus className={cn("mt-0.5 size-5 shrink-0", missing ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60")} />
        <div className="min-w-0">
          <p className={cn("text-sm font-medium", missing ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            {missing ? t("coverage.status.missing") : t("months.noStatement")}
          </p>
          <p className="flex min-w-0 text-xs text-muted-foreground">
            <AccountRef account={account} />
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <Button size="sm" variant="outline" onClick={onUpload} disabled={disabled}>
          <Upload /> {t("months.upload")}
        </Button>
      </div>
    </li>
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

  const source = s.account ? (
    <AccountRef account={s.account} />
  ) : (
    <span>
      {detectedBank ? t("row.detected", { bank: detectedBank.name }) : t("row.notDetected")}
      {s.detected?.ibanLast4 && ` · ${t("row.iban", { last4: s.detected.ibanLast4 })}`}
    </span>
  );
  const period = s.periodStart && s.periodEnd ? `${formatDate(s.periodStart, locale)} – ${formatDate(s.periodEnd, locale)}` : null;
  const notes = (
    <>
      {s.status === "failed" && s.error && <p className="text-xs text-red-600">{translateError(te, s.error)}</p>}
      {stuck && <p className="text-xs text-amber-700 dark:text-amber-400">{t("row.stuck")}</p>}
      {s.status === "needs_review" && s.issues > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t("row.balanceIssues", { count: s.issues })}</p>
      )}
    </>
  );
  const hasNotes = (s.status === "failed" && !!s.error) || stuck || (s.status === "needs_review" && s.issues > 0);
  const accountPicker = s.status === "needs_account" && (
    <>
      <Select onValueChange={assign} disabled={pending}>
        <SelectTrigger className="w-full min-w-0 md:w-56 [&>span]:min-w-0" size="sm">
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
  );
  const primary = (
    <>
      {(s.status === "needs_review" || s.status === "confirmed") && (
        <Button asChild size="sm" variant={s.status === "needs_review" ? "default" : "outline"}>
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
    </>
  );
  const secondary = (
    <>
      <Button asChild size="sm" variant="outline">
        <a href={`/api/statements/${s.id}/file`} target="_blank" rel="noreferrer">
          <FileText /> {t("row.viewPdf")}
        </a>
      </Button>
      {s.status !== "confirmed" && s.status !== "needs_account" && !(s.status === "failed" || stuck) && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryStatementAction(s.id), t("toasts.reprocessing"))}>
          <RotateCw /> {t("row.reprocess")}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={pending}
        onClick={() => setConfirmingDelete(true)}
      >
        <Trash2 /> {tc("actions.delete")}
      </Button>
    </>
  );

  return (
    <li>
      {/* Mobile: a card of label/value rows (like TransactionCard), with every action as a full-width button. */}
      <article className="md:hidden">
        <header className="flex items-start gap-3 px-4 pt-4 pb-2">
          <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <h3 className="min-w-0 flex-1 text-sm font-semibold break-all">{s.fileName}</h3>
        </header>
        <dl className="divide-y px-4 text-sm">
          <Field label={t("row.status")}>
            {s.status === "needs_account" ? <span className="text-muted-foreground">{t("row.whichAccount")}</span> : <StatusBadge status={s.status} progress={s.progress} />}
          </Field>
          <Field label={t("row.account")}>
            <span className="flex min-w-0">{source}</span>
          </Field>
          {period && <Field label={t("row.period")}>{period}</Field>}
        </dl>
        {hasNotes && <div className="space-y-1 px-4 pb-1">{notes}</div>}
        <div className="grid gap-2 px-4 pt-2 pb-4">
          {s.status === "needs_account" && <div className="flex gap-2">{accountPicker}</div>}
          {primary}
          <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">{secondary}</div>
        </div>
      </article>

      {/* Tablet: name | status, then account · period | actions. */}
      <div className="hidden space-y-2 p-4 md:block xl:hidden">
        <div className="flex items-center gap-4">
          <p className="flex min-w-0 flex-1 items-center gap-2 text-base font-medium">
            <FileText className="size-5 shrink-0 text-muted-foreground" />
            <span className="truncate" title={s.fileName}>
              {s.fileName}
            </span>
          </p>
          <StatusBadge status={s.status} progress={s.progress} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-7">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
              {source}
              {period && <span>· {period}</span>}
            </p>
            {hasNotes && notes}
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {accountPicker}
            {primary}
            {secondary}
          </div>
        </div>
      </div>

      {/* Desktop: one line per statement, all actions inline. */}
      <div className="hidden items-center gap-3 p-4 xl:flex">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <FileText className="mt-1 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-base font-medium" title={s.fileName}>
              {s.fileName}
            </p>
            <p className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
              {source}
              {period && <span>· {period}</span>}
            </p>
            {hasNotes && <div className="mt-1 space-y-1">{notes}</div>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {accountPicker || <StatusBadge status={s.status} progress={s.progress} />}
          {primary}
          {secondary}
        </div>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
