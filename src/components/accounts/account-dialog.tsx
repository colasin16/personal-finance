"use client";

import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Loader2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveAccountAction } from "@/lib/actions/household";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/labels";

export type BankOption = { id: string; name: string; color: string; country: string };
export type MemberOption = { id: string; displayName: string };
export type AccountFormValue = {
  id?: string;
  bankId: string;
  name: string;
  ibanLast4?: string | null;
  type: AccountType;
  isPrivate: boolean;
  owners: { userId: string; sharePct: number }[];
};


function splitEvenly(ids: string[]) {
  const base = Math.floor((100 / ids.length) * 100) / 100;
  return ids.map((userId, i) => ({ userId, sharePct: i === 0 ? Math.round((100 - base * (ids.length - 1)) * 100) / 100 : base }));
}

export function AccountDialog({
  open,
  onOpenChange,
  banks,
  members,
  currentUserId,
  initial,
  hint,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banks: BankOption[];
  members: MemberOption[];
  currentUserId: string;
  initial?: Partial<AccountFormValue>;
  hint?: string;
  onSaved?: (accountId: string) => void;
}) {
  const t = useTranslations("accounts");
  const tc = useTranslations("common");
  const editing = Boolean(initial?.id);
  const [bankId, setBankId] = useState(initial?.bankId ?? "");
  const [bankOpen, setBankOpen] = useState(!initial?.bankId);
  const [name, setName] = useState(initial?.name ?? "");
  const [iban, setIban] = useState("");
  const [type, setType] = useState<AccountFormValue["type"]>(initial?.type ?? "checking");
  const [isPrivate, setIsPrivate] = useState(initial?.isPrivate ?? false);
  const [owners, setOwners] = useState(initial?.owners ?? [{ userId: currentUserId, sharePct: 100 }]);
  const [pending, start] = useTransition();
  const bank = banks.find((b) => b.id === bankId);
  const total = owners.reduce((s, o) => s + o.sharePct, 0);

  const toggleOwner = (userId: string, checked: boolean) => {
    const ids = checked ? [...owners.map((o) => o.userId), userId] : owners.map((o) => o.userId).filter((id) => id !== userId);
    setOwners(ids.length ? splitEvenly(members.map((m) => m.id).filter((id) => ids.includes(id))) : []);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const result = await saveAccountAction({ bankId, name, iban: iban || undefined, type, isPrivate, owners, currency: "EUR" }, initial?.id);
      if (!result.ok) return void toast.error(result.error);
      toast.success(editing ? t("toasts.updated") : t("toasts.added"));
      onOpenChange(false);
      onSaved?.(result.data.id);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{editing ? t("dialog.editTitle") : t("dialog.addTitle")}</DialogTitle>
            <DialogDescription>{hint ?? t("dialog.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>{t("dialog.bank")}</Label>
            <Popover open={bankOpen} onOpenChange={setBankOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {bank ? (
                    <span className="flex items-center gap-2">
                      <span className="size-3 rounded-full" style={{ background: bank.color }} />
                      {bank.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t("dialog.bankPlaceholder")}</span>
                  )}
                  <ChevronsUpDown className="opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("dialog.bankSearch")} />
                  <CommandList>
                    <CommandEmpty>{t("dialog.bankEmpty")}</CommandEmpty>
                    <CommandGroup>
                      {banks.map((b) => (
                        <CommandItem
                          key={b.id}
                          value={`${b.name} ${b.id}`}
                          onSelect={() => {
                            setBankId(b.id);
                            if (!name) setName(b.id === "other" ? "" : t("dialog.defaultName", { bank: b.name }));
                            setBankOpen(false);
                          }}
                        >
                          <span className="size-3 rounded-full" style={{ background: b.color }} />
                          {b.name}
                          <span className="ml-auto text-xs text-muted-foreground">{b.country}</span>
                          {b.id === bankId && <Check />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-name">{t("dialog.name")}</Label>
              <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("dialog.namePlaceholder")} required maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label>{t("dialog.type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as AccountFormValue["type"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tc(`accountTypes.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="iban">
              {t("dialog.iban")} <span className="text-muted-foreground">{t("dialog.ibanHint")}</span>
            </Label>
            <Input
              id="iban"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder={initial?.ibanLast4 ? t("dialog.ibanKeep", { last4: initial.ibanLast4 }) : "ES00 0000 0000 0000 0000 0000"}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">{t("dialog.ibanStorage")}</p>
          </div>

          <div className="space-y-2">
            <Label>{t("dialog.owners")}</Label>
            <div className="divide-y rounded-lg border">
              {members.map((m) => {
                const owner = owners.find((o) => o.userId === m.id);
                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox id={`owner-${m.id}`} checked={!!owner} onCheckedChange={(c) => toggleOwner(m.id, c === true)} />
                    <Label htmlFor={`owner-${m.id}`} className="flex-1 font-normal">
                      {m.displayName}
                      {m.id === currentUserId && <span className="text-muted-foreground"> {t("dialog.you")}</span>}
                    </Label>
                    {owner && owners.length > 1 && (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          className="h-8 w-20 text-right"
                          value={owner.sharePct}
                          aria-label={t("dialog.share", { name: m.displayName })}
                          onChange={(e) =>
                            setOwners(owners.map((o) => (o.userId === m.id ? { ...o, sharePct: Number(e.target.value) } : o)))
                          }
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {owners.length > 1 && Math.abs(total - 100) > 0.01 && <p className="text-xs text-destructive">{t("dialog.sharesTotal", { total })}</p>}
            {members.length === 1 && <p className="text-xs text-muted-foreground">{t("dialog.inviteHint")}</p>}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="private" className="flex items-center gap-1.5">
                <Lock className="size-3.5" /> {t("dialog.private")}
              </Label>
              <p className="text-xs text-muted-foreground">{t("dialog.privateHint")}</p>
            </div>
            <Switch id="private" checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button type="submit" disabled={pending || !bankId || owners.length === 0 || Math.abs(total - 100) > 0.01}>
              {pending && <Loader2 className="animate-spin" />}
              {editing ? tc("actions.saveChanges") : t("addAccount")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

