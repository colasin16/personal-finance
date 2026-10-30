"use client";

import { useEffect, useState, useTransition } from "react";
import { Link2, Loader2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AccountRef } from "@/components/accounts/account-ref";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { findTransferMatchesAction, linkTransferAction, type TransferMatch } from "@/lib/actions/transactions";
import { formatDate } from "@/lib/labels";

/** Lets the user pick the other side of a transfer among mirror movements in their other accounts. */
export function LinkTransferPicker({
  transactionId,
  amountCents,
  onCancel,
  onLinked,
}: {
  transactionId: string;
  amountCents: number;
  onCancel: () => void;
  onLinked: () => void;
}) {
  const t = useTranslations("transactions.linkTransfer");
  const locale = useLocale();
  const [matches, setMatches] = useState<TransferMatch[] | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let active = true;
    findTransferMatchesAction(transactionId).then((r) => {
      if (!active) return;
      if (r.ok) setMatches(r.data);
      else {
        toast.error(r.error);
        setMatches([]);
      }
    });
    return () => {
      active = false;
    };
  }, [transactionId]);

  const link = (match: TransferMatch) => {
    setLinkingId(match.id);
    start(async () => {
      const [outgoing, incoming] = amountCents < 0 ? [transactionId, match.id] : [match.id, transactionId];
      const r = await linkTransferAction(outgoing, incoming);
      if (r.ok) {
        toast.success(t("linked"));
        onLinked();
      } else toast.error(r.error);
      setLinkingId(null);
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link2 className="size-3 text-sky-600" /> {t("title")}
        </p>
        <Button variant="ghost" size="icon" className="size-6" onClick={onCancel} aria-label={t("cancel")} title={t("cancel")}>
          <X />
        </Button>
      </div>
      {matches === null ? (
        <ul className="space-y-1.5" aria-busy="true">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border p-2.5">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-16" />
            </li>
          ))}
        </ul>
      ) : matches.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          <ul className="space-y-1.5">
            {matches.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <AccountRef account={m.account} className="max-w-full" />
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(m.bookedAt, locale)} · {m.description}
                  </p>
                </div>
                <Money cents={m.amountCents} currency={m.currency} colored className="shrink-0 font-medium" />
                <Button size="sm" variant="outline" className="shrink-0" disabled={pending} onClick={() => link(m)}>
                  {linkingId === m.id ? <Loader2 className="animate-spin" /> : <Link2 />} {t("link")}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
