"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { configureBankAccountsAction } from "@/lib/actions/bank-sync";
import { AccountRef, type AccountRefData } from "@/components/accounts/account-ref";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SetupLink = { id: string; name: string; ibanLast4: string | null };
export type SetupData = {
  defaultSyncFrom: string;
  /** First allowed day per app account (the day after its PDF coverage); null when it has no PDFs. */
  minByAccount: Record<string, string | null>;
  takenAccountIds: string[];
  lockedLinkIds: string[];
  proposals: { linkId: string; accountId: string | null; matched: boolean; syncFrom: string }[];
};

const SKIP = "skip";
const NEW = "new";

const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
};

/** Maps each bank account to an app account and a first import day, then runs the first sync. */
export function SetupAccountsDialog({
  open,
  onOpenChange,
  connectionId,
  bankName,
  links,
  accounts,
  setup,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  bankName: string;
  links: SetupLink[];
  accounts: (AccountRefData & { id: string })[];
  setup: SetupData;
  today: string;
}) {
  const t = useTranslations("bankSync");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choices, setChoices] = useState(() =>
    Object.fromEntries(setup.proposals.map((p) => [p.linkId, { accountId: p.accountId ?? SKIP, syncFrom: p.syncFrom }])),
  );

  const chosen = (linkId: string) => choices[linkId] ?? { accountId: SKIP, syncFrom: setup.defaultSyncFrom };
  const usedElsewhere = (linkId: string, accountId: string) =>
    Object.entries(choices).some(([id, c]) => id !== linkId && c.accountId === accountId) ||
    (setup.takenAccountIds.includes(accountId) && setup.proposals.find((p) => p.linkId === linkId)?.accountId !== accountId);

  const setAccount = (linkId: string, accountId: string) =>
    setChoices((all) => {
      const min = accountId !== SKIP && accountId !== NEW ? setup.minByAccount[accountId] : null;
      const current = all[linkId]?.syncFrom ?? setup.defaultSyncFrom;
      // Default to the cutover day (right after the PDFs); without PDFs keep what was there.
      return { ...all, [linkId]: { accountId, syncFrom: min ?? current } };
    });

  const dateLabel = (iso: string | Date) =>
    format.dateTime(typeof iso === "string" ? new Date(`${iso}T00:00:00Z`) : iso, { dateStyle: "medium", timeZone: "UTC" });

  const save = () =>
    startTransition(async () => {
      const result = await configureBankAccountsAction({
        connectionId,
        choices: links.map((l) => {
          const c = chosen(l.id);
          return { linkId: l.id, accountId: c.accountId === SKIP ? null : c.accountId, syncFrom: c.accountId === SKIP ? null : c.syncFrom };
        }),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("setup.done", { count: result.data.inserted }));
      onOpenChange(false);
      router.replace("/settings/bank-connections", { scroll: false });
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("setup.title", { bank: bankName })}</DialogTitle>
          <DialogDescription>{t("setup.description")}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] space-y-3 overflow-y-auto">
          {links.map((link) => {
            const c = chosen(link.id);
            const locked = setup.lockedLinkIds.includes(link.id);
            const min = c.accountId !== SKIP && c.accountId !== NEW ? setup.minByAccount[c.accountId] : null;
            const proposal = setup.proposals.find((p) => p.linkId === link.id);
            return (
              <li key={link.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">
                    {link.name}
                    {link.ibanLast4 && <span className="ml-1.5 text-muted-foreground tabular-nums">•• {link.ibanLast4}</span>}
                  </span>
                  {proposal?.matched && c.accountId === proposal.accountId && (
                    <Badge variant="secondary" className="shrink-0">
                      {t("setup.matched")}
                    </Badge>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`account-${link.id}`}>{t("setup.account")}</Label>
                    <Select value={c.accountId} onValueChange={(v) => setAccount(link.id, v)} disabled={pending || locked}>
                      <SelectTrigger id={`account-${link.id}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP}>{t("setup.skip")}</SelectItem>
                        <SelectItem value={NEW}>{t("setup.create")}</SelectItem>
                        {accounts.length > 0 && <SelectSeparator />}
                        {accounts.map((a) => {
                          const taken = usedElsewhere(link.id, a.id);
                          return (
                            <SelectItem key={a.id} value={a.id} disabled={taken}>
                              <AccountRef account={a} size="md" />
                              {taken && <span className="text-xs text-muted-foreground">({t("setup.taken")})</span>}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  {c.accountId !== SKIP && (
                    <div className="space-y-1.5">
                      <Label htmlFor={`from-${link.id}`}>{t("setup.from")}</Label>
                      <Input
                        id={`from-${link.id}`}
                        type="date"
                        value={c.syncFrom}
                        min={min ?? undefined}
                        max={today}
                        required
                        disabled={pending || locked}
                        onChange={(e) => setChoices((all) => ({ ...all, [link.id]: { ...c, syncFrom: e.target.value } }))}
                      />
                    </div>
                  )}
                </div>
                {c.accountId !== SKIP && (
                  <p className="text-xs text-muted-foreground">
                    {locked ? t("setup.fromLocked") : min ? t("setup.fromAfterPdf", { date: dateLabel(dayBefore(min)) }) : t("setup.fromNoPdf")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button
            onClick={save}
            disabled={
              pending ||
              links.some((l) => {
                const c = chosen(l.id);
                if (c.accountId === SKIP) return false;
                const min = c.accountId !== NEW ? setup.minByAccount[c.accountId] : null;
                return !c.syncFrom || c.syncFrom > today || (!!min && c.syncFrom < min);
              })
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? t("setup.saving") : t("setup.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
