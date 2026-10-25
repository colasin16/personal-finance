"use client";

import { useState, useTransition } from "react";
import { Copy, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createCategoryAction, inviteMemberAction, renameHouseholdAction } from "@/lib/actions/household";
import { deleteRuleAction } from "@/lib/actions/transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function HouseholdNameForm({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await renameHouseholdAction(value);
          if (r.ok) toast.success("Household renamed");
          else toast.error(r.error);
        });
      }}
    >
      <div className="flex-1 space-y-2">
        <Label htmlFor="household-name">Name</Label>
        <Input id="household-name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} />
      </div>
      <Button type="submit" variant="outline" disabled={pending || value.trim() === name || !value.trim()}>
        Save
      </Button>
    </form>
  );
}

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await inviteMemberAction(email);
            if (!r.ok) return void toast.error(r.error);
            setLink(`${window.location.origin}${r.data.url}`);
            setEmail("");
          });
        }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="invite-email">Invite your partner</Label>
          <Input id="invite-email" type="email" placeholder="partner@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Invite
        </Button>
      </form>
      {link && (
        <div className="space-y-1 rounded-lg bg-muted p-3 text-xs">
          <p className="text-muted-foreground">Email delivery is mocked in offline mode — share this link (valid 14 days):</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate">{link}</code>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Copy link"
              onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copied"))}
            >
              <Copy />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const COLORS = ["#6366f1", "#22c55e", "#f97316", "#ec4899", "#14b8a6", "#eab308", "#8b5cf6", "#ef4444", "#0ea5e9", "#64748b"];

export function AddCategoryForm() {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income" | "transfer">("expense");
  const [color, setColor] = useState(COLORS[0]!);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createCategoryAction({ name, kind, color });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Category added");
          setName("");
        });
      }}
    >
      <Label htmlFor="category-name">New category</Label>
      <div className="flex flex-wrap gap-2">
        <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pets" className="w-40 flex-1" maxLength={40} required />
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={pending}>
          <Plus /> Add
        </Button>
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Color">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === color}
            aria-label={c}
            onClick={() => setColor(c)}
            className="size-6 rounded-full ring-offset-2 aria-checked:ring-2 aria-checked:ring-foreground"
            style={{ background: c }}
          />
        ))}
      </div>
    </form>
  );
}

export function DeleteRuleButton({ ruleId }: { ruleId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7"
      aria-label="Delete rule"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await deleteRuleAction(ruleId);
          if (r.ok) toast.success("Rule deleted");
          else toast.error(r.error);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
