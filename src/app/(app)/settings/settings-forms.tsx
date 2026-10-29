"use client";

import { useState, useTransition } from "react";
import { Copy, Loader2, Plus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createCategoryAction, inviteMemberAction, renameHouseholdAction } from "@/lib/actions/household";
import { IconPicker } from "@/components/transactions/icon-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function HouseholdNameForm({ name }: { name: string }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await renameHouseholdAction(value);
          if (r.ok) toast.success(t("household.renamed"));
          else toast.error(r.error);
        });
      }}
    >
      <div className="flex-1 space-y-2">
        <Label htmlFor="household-name">{t("household.name")}</Label>
        <Input id="household-name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} />
      </div>
      <Button type="submit" variant="outline" disabled={pending || value.trim() === name || !value.trim()}>
        {tc("actions.save")}
      </Button>
    </form>
  );
}

export function InviteForm() {
  const t = useTranslations("settings.invite");
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
          <Label htmlFor="invite-email">{t("label")}</Label>
          <Input id="invite-email" type="email" placeholder={t("placeholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} {t("submit")}
        </Button>
      </form>
      {link && (
        <div className="space-y-1 rounded-lg bg-muted p-3 text-xs">
          <p className="text-muted-foreground">{t("mockedEmail")}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate">{link}</code>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={t("copyLink")}
              onClick={() => navigator.clipboard.writeText(link).then(() => toast.success(t("linkCopied")))}
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
  const t = useTranslations("settings.categories");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income" | "transfer">("expense");
  const [color, setColor] = useState(COLORS[0]!);
  const [icon, setIcon] = useState("tag");
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createCategoryAction({ name, kind, color, icon });
          if (!r.ok) return void toast.error(r.error);
          toast.success(t("added"));
          setName("");
        });
      }}
    >
      <Label htmlFor="category-name">{t("new")}</Label>
      <div className="flex flex-wrap gap-2">
        <IconPicker value={icon} color={color} onChange={setIcon} />
        <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("placeholder")} className="w-40 flex-1" maxLength={40} required />
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["expense", "income", "transfer"] as const).map((k) => (
              <SelectItem key={k} value={k}>
                {t(`kinds.${k}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={pending}>
          <Plus /> {tc("actions.add")}
        </Button>
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label={t("color")}>
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
