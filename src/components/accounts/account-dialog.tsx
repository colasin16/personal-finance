"use client";

import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Loader2, Lock } from "lucide-react";
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
import { ACCOUNT_TYPES as TYPES } from "@/lib/labels";

export type BankOption = { id: string; name: string; color: string; country: string };
export type MemberOption = { id: string; displayName: string };
export type AccountFormValue = {
  id?: string;
  bankId: string;
  name: string;
  ibanLast4?: string | null;
  type: "checking" | "savings" | "credit" | "investment";
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
      toast.success(editing ? "Account updated" : "Account added");
      onOpenChange(false);
      onSaved?.(result.data.id);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit account" : "Add an account"}</DialogTitle>
            <DialogDescription>{hint ?? "Pick your bank and tell us who owns the account."}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Bank</Label>
            <Popover open={bankOpen} onOpenChange={setBankOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {bank ? (
                    <span className="flex items-center gap-2">
                      <span className="size-3 rounded-full" style={{ background: bank.color }} />
                      {bank.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Search for your bank…</span>
                  )}
                  <ChevronsUpDown className="opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                <Command>
                  <CommandInput placeholder="ING, BBVA, Revolut…" />
                  <CommandList>
                    <CommandEmpty>No bank found — choose “Other bank”.</CommandEmpty>
                    <CommandGroup>
                      {banks.map((b) => (
                        <CommandItem
                          key={b.id}
                          value={`${b.name} ${b.id}`}
                          onSelect={() => {
                            setBankId(b.id);
                            if (!name) setName(b.id === "other" ? "" : `${b.name} account`);
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
              <Label htmlFor="account-name">Name</Label>
              <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Joint account" required maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as AccountFormValue["type"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="iban">
              IBAN <span className="text-muted-foreground">(optional — lets us recognise this account&apos;s statements)</span>
            </Label>
            <Input
              id="iban"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder={initial?.ibanLast4 ? `•••• ${initial.ibanLast4} (leave empty to keep)` : "ES00 0000 0000 0000 0000 0000"}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">Only the last 4 digits and a salted hash are stored.</p>
          </div>

          <div className="space-y-2">
            <Label>Owners</Label>
            <div className="divide-y rounded-lg border">
              {members.map((m) => {
                const owner = owners.find((o) => o.userId === m.id);
                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox id={`owner-${m.id}`} checked={!!owner} onCheckedChange={(c) => toggleOwner(m.id, c === true)} />
                    <Label htmlFor={`owner-${m.id}`} className="flex-1 font-normal">
                      {m.displayName}
                      {m.id === currentUserId && <span className="text-muted-foreground"> (you)</span>}
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
                          aria-label={`${m.displayName} share`}
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
            {owners.length > 1 && Math.abs(total - 100) > 0.01 && <p className="text-xs text-destructive">Shares add up to {total}% — they must total 100%.</p>}
            {members.length === 1 && <p className="text-xs text-muted-foreground">Invite your partner in Settings to share accounts.</p>}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="private" className="flex items-center gap-1.5">
                <Lock className="size-3.5" /> Private
              </Label>
              <p className="text-xs text-muted-foreground">Only the owners can see this account and its transactions.</p>
            </div>
            <Switch id="private" checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !bankId || owners.length === 0 || Math.abs(total - 100) > 0.01}>
              {pending && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

