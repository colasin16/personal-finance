"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { dismissSuggestionAction, linkTransferAction } from "@/lib/actions/transactions";
import { formatDate } from "@/lib/labels";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Side = { id: string; date: string; account: string; description: string };

export function TransferSuggestionCard({
  outgoing,
  incoming,
  amountCents,
  dismissKey,
}: {
  outgoing: Side;
  incoming: Side;
  amountCents: number;
  dismissKey: string;
}) {
  const t = useTranslations("issues.transfers");
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <Card className="py-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Money cents={amountCents} className="text-lg font-semibold" />
          <span className="text-xs text-muted-foreground">{formatDate(outgoing.date, locale)}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium">{outgoing.account}</p>
            <p className="truncate text-xs text-muted-foreground">{outgoing.description}</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate font-medium">{incoming.account}</p>
            <p className="truncate text-xs text-muted-foreground">{incoming.description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => void (await dismissSuggestionAction(dismissKey)))}>
            {t("notTransfer")}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await linkTransferAction(outgoing.id, incoming.id);
                if (result.ok) toast.success(t("linked"));
                else toast.error(result.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Link2 />} {t("link")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
