"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { categorizeMerchantAction, dismissSuggestionAction, linkTransferAction } from "@/lib/actions/transactions";
import { formatDate } from "@/lib/labels";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryPicker, type CategoryOption } from "@/components/transactions/category-picker";

export function MerchantGroupCard({
  merchant,
  dismissKey,
  totalCents,
  rows,
  categories,
}: {
  merchant: string;
  dismissKey: string;
  totalCents: number;
  rows: { id: string; bookedAt: string; amountCents: number; accountName: string; reason: string | null; description: string }[];
  categories: CategoryOption[];
}) {
  const [remember, setRemember] = useState(true);
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const choose = (categoryId: string | null) => {
    if (!categoryId) return;
    start(async () => {
      const result = await categorizeMerchantAction(
        rows.map((r) => r.id),
        merchant,
        categoryId,
        remember,
      );
      if (!result.ok) return void toast.error(result.error);
      toast.success(`${rows.length} transaction${rows.length > 1 ? "s" : ""} categorized${remember ? " · rule saved" : ""}`);
    });
  };

  return (
    <Card className="py-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{merchant}</p>
            <p className="text-xs text-muted-foreground">
              {rows.length} transaction{rows.length > 1 ? "s" : ""} · <Money cents={totalCents} /> · {rows[0]?.reason ?? "Low confidence"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Dismiss"
            disabled={pending}
            onClick={() => start(async () => void (await dismissSuggestionAction(dismissKey)))}
          >
            <X />
          </Button>
        </div>
        {(expanded ? rows : rows.slice(0, 3)).map((r) => (
          <div key={r.id} className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              {formatDate(r.bookedAt)} · {r.accountName} · {r.description}
            </span>
            <Money cents={r.amountCents} className="shrink-0" />
          </div>
        ))}
        {rows.length > 3 && (
          <button className="text-xs text-muted-foreground underline" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Show less" : `Show ${rows.length - 3} more`}
          </button>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={remember} onCheckedChange={(c) => setRemember(c === true)} />
            Remember for future statements
          </label>
          <div className="flex items-center gap-2">
            {pending && <Loader2 className="size-4 animate-spin" />}
            <CategoryPicker categories={categories} value={null} onChange={choose} placeholder="Choose category" variant="outline" disabled={pending} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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
  const [pending, start] = useTransition();
  return (
    <Card className="py-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Money cents={amountCents} className="text-lg font-semibold" />
          <span className="text-xs text-muted-foreground">{formatDate(outgoing.date)}</span>
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
            Not a transfer
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await linkTransferAction(outgoing.id, incoming.id);
                if (result.ok) toast.success("Linked as transfer");
                else toast.error(result.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Link2 />} Link as transfer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
