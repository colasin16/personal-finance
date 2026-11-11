"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, Landmark, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { disconnectBankAction, syncBankNowAction } from "@/lib/actions/bank-sync";
import { cn } from "@/lib/utils";
import { AccountRef, type AccountRefData } from "@/components/accounts/account-ref";
import { BankLogo } from "@/components/brand/bank-logo";
import { Money } from "@/components/money";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConnectBankDialog, useStartConnection } from "./connect-dialog";
import { SetupAccountsDialog, type SetupData } from "./setup-dialog";

export type ConnectionItem = {
  id: string;
  bankName: string;
  bankId: string;
  bankColor: string;
  createdBy: string;
  ownerName: string;
  status: "active" | "expired" | "revoked" | "error";
  validUntil: Date | null;
  daysLeft: number | null;
  lastSyncedAt: Date | null;
  lastError: string | null;
  syncsLeftToday: number;
  accounts: {
    id: string;
    name: string;
    ibanLast4: string | null;
    accountId: string | null;
    syncFrom: string | null;
    lastBalanceCents: number | null;
  }[];
};

/** Settings → Bank connections: connect, set up, sync, reconnect and disconnect banks. */
export function BankConnections({
  connections,
  accounts,
  setups,
  userId,
  today,
  now,
  openSetupId,
  error,
  mocked,
}: {
  connections: ConnectionItem[];
  accounts: (AccountRefData & { id: string })[];
  /** Setup data for the connections this user owns. */
  setups: Record<string, SetupData>;
  userId: string;
  today: string;
  /** Server time, so relative times ("2 hours ago") render the same on server and client. */
  now: Date;
  openSetupId: string | null;
  error: string | null;
  mocked: boolean;
}) {
  const t = useTranslations("bankSync");
  const [connectOpen, setConnectOpen] = useState(false);
  const [setupId, setSetupId] = useState<string | null>(openSetupId && setups[openSetupId] ? openSetupId : null);
  const setupConnection = connections.find((c) => c.id === setupId);

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {mocked && <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{t("mockNotice")}</p>}

      {connections.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
          <Landmark className="size-8 text-muted-foreground" />
          <div className="space-y-1">
            <p className="font-medium">{t("empty.title")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("empty.body")}</p>
          </div>
          <Button onClick={() => setConnectOpen(true)}>
            <Plus className="size-4" /> {t("connect")}
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {connections.map((c) => (
              <ConnectionCard key={c.id} connection={c} accounts={accounts} isOwner={c.createdBy === userId} now={now} onSetUp={() => setSetupId(c.id)} />
            ))}
          </ul>
          <Button variant="outline" onClick={() => setConnectOpen(true)}>
            <Plus className="size-4" /> {t("connect")}
          </Button>
        </>
      )}

      <ConnectBankDialog open={connectOpen} onOpenChange={setConnectOpen} />
      {setupConnection && setups[setupConnection.id] && (
        <SetupAccountsDialog
          key={setupConnection.id}
          open
          onOpenChange={(open) => !open && setSetupId(null)}
          connectionId={setupConnection.id}
          bankName={setupConnection.bankName}
          links={setupConnection.accounts}
          accounts={accounts}
          setup={setups[setupConnection.id]!}
          today={today}
        />
      )}
    </div>
  );
}

function StatusBadge({ connection }: { connection: ConnectionItem }) {
  const t = useTranslations("bankSync");
  if (connection.status !== "active") {
    return (
      <Badge variant={connection.status === "expired" || connection.status === "error" ? "destructive" : "outline"}>{t(`status.${connection.status}`)}</Badge>
    );
  }
  if (connection.daysLeft !== null && connection.daysLeft <= 14) {
    return (
      <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
        {t("status.expiring", { days: connection.daysLeft })}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">
      {t("status.active")}
    </Badge>
  );
}

function ConnectionCard({
  connection: c,
  accounts,
  isOwner,
  now,
  onSetUp,
}: {
  connection: ConnectionItem;
  accounts: (AccountRefData & { id: string })[];
  isOwner: boolean;
  now: Date;
  onSetUp: () => void;
}) {
  const t = useTranslations("bankSync");
  const format = useFormatter();
  const router = useRouter();
  const [syncing, startSync] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reconnect = useStartConnection();
  const active = c.status === "active";
  const unconfigured = c.accounts.every((a) => !a.accountId);
  const dateLabel = (d: Date | string) =>
    format.dateTime(typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d, { dateStyle: "medium", ...(typeof d === "string" ? { timeZone: "UTC" } : {}) });

  const syncNow = () =>
    startSync(async () => {
      const result = await syncBankNowAction(c.id);
      if (result.ok) toast.success(t("synced", { count: result.data.inserted }));
      else toast.error(result.error);
      router.refresh();
    });

  const disconnect = () =>
    startDisconnect(async () => {
      const result = await disconnectBankAction(c.id);
      if (result.ok) {
        toast.success(t("disconnected", { bank: c.bankName }));
        setConfirmOpen(false);
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <li className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start gap-3 p-3">
        <BankLogo bankId={c.bankId} name={c.bankName} color={c.bankColor} size={32} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{c.bankName}</span>
            <StatusBadge connection={c} />
          </div>
          <p className="text-xs text-muted-foreground">
            {[
              t("connectedBy", { name: c.ownerName }),
              c.lastSyncedAt ? t("lastSynced", { when: format.relativeTime(c.lastSyncedAt, now) }) : t("neverSynced"),
              active && c.validUntil ? t("validUntil", { date: dateLabel(c.validUntil) }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {active && c.lastError && <p className="text-xs text-amber-700 dark:text-amber-400">{t("lastError")}</p>}
        </div>
        {isOwner && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {active ? (
              unconfigured ? (
                <Button size="sm" onClick={onSetUp}>
                  {t("setUp")}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing || c.syncsLeftToday === 0} title={c.syncsLeftToday === 0 ? t("syncLimit") : undefined}>
                  <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
                  {syncing ? t("syncing") : t("syncNow")}
                </Button>
              )
            ) : (
              <Button size="sm" onClick={() => reconnect.start({ connectionId: c.id }, c.bankName)} disabled={reconnect.pending}>
                {reconnect.pending && <Loader2 className="size-4 animate-spin" />}
                {t("reconnect")}
              </Button>
            )}
            {active && c.daysLeft !== null && c.daysLeft <= 14 && (
              <Button size="sm" variant="outline" onClick={() => reconnect.start({ connectionId: c.id }, c.bankName)} disabled={reconnect.pending}>
                {t("reconnect")}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmOpen(true)}>
              {t("disconnect")}
            </Button>
          </div>
        )}
      </div>
      {c.accounts.length > 0 && (
        <ul className="divide-y border-t">
          {c.accounts.map((a) => {
            const account = a.accountId ? accounts.find((x) => x.id === a.accountId) : null;
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {a.name}
                  {a.ibanLast4 && <span className="ml-1.5 text-muted-foreground tabular-nums">•• {a.ibanLast4}</span>}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {account && a.syncFrom ? (
                    <>
                      <span className="text-foreground">
                        <AccountRef account={account} />
                      </span>
                      <span>{t("accounts.since", { date: dateLabel(a.syncFrom) })}</span>
                      {a.lastBalanceCents !== null && (
                        <span>
                          {t("accounts.balance")} <Money cents={a.lastBalanceCents} className="text-foreground" />
                        </span>
                      )}
                    </>
                  ) : (
                    <span>{t("accounts.notSynced")}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {isOwner && active && !unconfigured && (
        <div className="border-t px-3 py-2">
          <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={onSetUp}>
            {t("setUp")}
          </Button>
        </div>
      )}
      {!isOwner && <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t("ownerOnly", { name: c.ownerName })}</p>}

      <Dialog open={confirmOpen} onOpenChange={(open) => !disconnecting && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("disconnectTitle", { bank: c.bankName })}</DialogTitle>
            <DialogDescription>{t("disconnectBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={disconnect} disabled={disconnecting}>
              {disconnecting && <Loader2 className="size-4 animate-spin" />}
              {t("disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
