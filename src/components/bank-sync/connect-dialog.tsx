"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { connectBankAction, listBanksAction, type ProviderBankOption } from "@/lib/actions/bank-sync";
import { BankLogo } from "@/components/brand/bank-logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const normalizeSearch = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Sends the browser to the bank's consent screen (new connection or reconnect). */
export function useStartConnection() {
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const start = (input: { bankName?: string; connectionId?: string }, label: string) => {
    setTarget(label);
    startTransition(async () => {
      const result = await connectBankAction(input);
      if (result.ok) window.location.assign(result.data.url);
      else {
        setTarget(null);
        toast.error(result.error);
      }
    });
  };
  return { start, pending, target };
}

/** Bank picker: search, pick, and go approve access at the bank. */
export function ConnectBankDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("bankSync");
  const [banks, setBanks] = useState<ProviderBankOption[] | null>(null);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const { start, pending, target } = useStartConnection();

  useEffect(() => {
    if (!open || banks) return;
    let cancelled = false;
    void listBanksAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setBanks(result.data);
      else {
        toast.error(result.error);
        onOpenChange(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, banks, onOpenChange]);

  const needle = normalizeSearch(deferred);
  const shown = (banks ?? []).filter((b) => !needle || normalizeSearch(b.name).includes(needle));

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("dialog.search")}
            aria-label={t("dialog.search")}
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="-mx-1 max-h-80 overflow-y-auto">
          {!banks ? (
            <p className="flex items-center gap-2 px-1 py-6 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("dialog.loading")}
            </p>
          ) : shown.length === 0 ? (
            <p className="px-1 py-6 text-center text-muted-foreground">{t("dialog.none", { query })}</p>
          ) : (
            <ul className="space-y-0.5">
              {shown.map((bank) => (
                <li key={`${bank.country}:${bank.name}`}>
                  <Button
                    variant="ghost"
                    className="h-11 w-full justify-start gap-3 px-2"
                    disabled={pending}
                    onClick={() => start({ bankName: bank.name }, bank.name)}
                  >
                    <BankLogo bankId={bank.bankId} name={bank.name} color={bank.color} size={24} />
                    <span className="truncate">{bank.name}</span>
                    {bank.beta && <span className="text-xs text-muted-foreground">{t("dialog.beta")}</span>}
                    {pending && target === bank.name && <Loader2 className="ml-auto size-4 animate-spin" />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{pending && target ? t("dialog.redirecting", { bank: target }) : t("dialog.how")}</p>
      </DialogContent>
    </Dialog>
  );
}
