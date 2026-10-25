"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, FileText, FileUp, Loader2, MoreHorizontal, Plus, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DetectedStatementInfo } from "@/lib/db/schema";
import { assignStatementAccountAction, deleteStatementAction, retryStatementAction } from "@/lib/actions/statements";
import { formatDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { AccountDialog, type BankOption, type MemberOption } from "@/components/accounts/account-dialog";
import { useUpload } from "@/components/shell/upload-provider";
import { StatusBadge } from "@/components/statements/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type StatementItem = {
  id: string;
  fileName: string;
  status: string;
  progress: string | null;
  error: string | null;
  accountName: string | null;
  bankName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  issues: number;
  detected: DetectedStatementInfo | null;
  createdAt: string;
};

type AccountOption = { id: string; name: string; bankName: string; bankColor: string };

const AUTO = "auto";

export function ImportView({
  accounts,
  banks,
  members,
  currentUserId,
  statements,
  jobsRunning,
}: {
  accounts: AccountOption[];
  banks: BankOption[];
  members: MemberOption[];
  currentUserId: string;
  statements: StatementItem[];
  jobsRunning: boolean;
}) {
  const router = useRouter();
  const { upload, uploading } = useUpload();
  const [target, setTarget] = useState(AUTO);
  const [over, setOver] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const busy = statements.some((s) => s.status === "uploaded" || s.status === "processing");

  // Poll while the background queue works through uploads.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [busy, router]);

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
          <p className="text-lg font-medium">Drag & drop your PDF statements here</p>
          <p className="text-sm text-muted-foreground">Several files and banks at once are fine · up to 15 MB each</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => input.current?.click()} disabled={uploading} className="bg-emerald-600 hover:bg-emerald-700">
            Choose files
          </Button>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-60" aria-label="Account for these files">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>Detect account automatically</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} · {a.bankName}
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
            Tip: <Link href="/accounts" className="underline">add your accounts</Link> with their IBAN first so statements are matched automatically.
          </p>
        )}
      </div>

      <Card className="py-0">
        <CardContent className="p-0">
          {statements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <FileText className="size-8" />
              No statements yet. Your uploads will appear here.
            </div>
          ) : (
            <ul className="divide-y">
              {statements.map((s) => (
                <StatementRow
                  key={s.id}
                  statement={s}
                  accounts={accounts}
                  banks={banks}
                  members={members}
                  currentUserId={currentUserId}
                  stuck={!jobsRunning && (s.status === "uploaded" || s.status === "processing") && now - Date.parse(s.createdAt) > 60_000}
                />
              ))}
            </ul>
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
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error);
      else if (success) toast.success(success);
    });
  const assign = (accountId: string) => run(() => assignStatementAccountAction(s.id, accountId), "Account assigned — processing");
  const detectedBank = banks.find((b) => b.id === s.detected?.bankId);

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{s.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {s.accountName ? `${s.accountName} · ${s.bankName}` : detectedBank ? `Detected ${detectedBank.name}` : "Account not detected yet"}
            {s.detected?.ibanLast4 && !s.accountName && ` · IBAN •••• ${s.detected.ibanLast4}`}
            {s.periodStart && s.periodEnd && ` · ${formatDate(s.periodStart)} – ${formatDate(s.periodEnd)}`}
          </p>
          {s.status === "failed" && s.error && <p className="mt-1 text-xs text-red-600">{s.error}</p>}
          {stuck && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Processing was interrupted (server restarted). Retry to continue.</p>}
          {s.status === "needs_review" && s.issues > 0 && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{s.issues} balance check{s.issues > 1 ? "s" : ""} didn&apos;t add up — please review.</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        {s.status === "needs_account" ? (
          <>
            <Select onValueChange={assign} disabled={pending}>
              <SelectTrigger className="w-48" size="sm">
                <SelectValue placeholder="Which account is it?" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus /> New
            </Button>
          </>
        ) : (
          <StatusBadge status={s.status} progress={s.progress} />
        )}
        {(s.status === "needs_review" || s.status === "confirmed") && (
          <Button asChild size="sm" variant={s.status === "needs_review" ? "default" : "ghost"}>
            <Link href={`/statements/${s.id}`}>
              {s.status === "needs_review" ? "Review" : "Open"} <ArrowRight />
            </Link>
          </Button>
        )}
        {(s.status === "failed" || stuck) && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryStatementAction(s.id), "Retrying")}>
            {pending ? <Loader2 className="animate-spin" /> : <RotateCw />} Retry
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={`/api/statements/${s.id}/file`} target="_blank" rel="noreferrer">
                <FileText /> View PDF
              </a>
            </DropdownMenuItem>
            {s.status !== "confirmed" && s.status !== "needs_account" && (
              <DropdownMenuItem onSelect={() => run(() => retryStatementAction(s.id), "Reprocessing")}>
                <RotateCw /> Reprocess
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                if (confirm(`Delete ${s.fileName} and its transactions?`)) run(() => deleteStatementAction(s.id), "Statement deleted");
              }}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {creating && (
        <AccountDialog
          open
          onOpenChange={setCreating}
          banks={banks}
          members={members}
          currentUserId={currentUserId}
          initial={{ bankId: s.detected?.bankId ?? undefined, name: detectedBank ? `${detectedBank.name} account` : "" }}
          hint={
            s.detected?.ibanLast4
              ? `We found IBAN •••• ${s.detected.ibanLast4} in this statement. Future statements of this account will be matched automatically.`
              : undefined
          }
          onSaved={assign}
        />
      )}
    </li>
  );
}
