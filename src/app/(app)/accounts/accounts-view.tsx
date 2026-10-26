"use client";

import { useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  Landmark,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { archiveAccountAction } from "@/lib/actions/household";
import {
  AccountDialog,
  type AccountFormValue,
  type BankOption,
  type MemberOption,
} from "@/components/accounts/account-dialog";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { BankLogo } from "@/components/brand/bank-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/labels";
import { cn } from "@/lib/utils";

type AccountItem = {
  id: string;
  name: string;
  bankId: string;
  bankName: string;
  bankColor: string;
  ibanLast4: string | null;
  type: AccountFormValue["type"];
  isPrivate: boolean;
  isShared: boolean;
  archived: boolean;
  owners: { userId: string; displayName: string; sharePct: number }[];
  balanceCents: number | null;
  balanceDate: string | null;
  currency: string;
};

export function AccountsView({
  accounts,
  banks,
  members,
  currentUserId,
}: {
  accounts: AccountItem[];
  banks: BankOption[];
  members: MemberOption[];
  currentUserId: string;
}) {
  const t = useTranslations("accounts");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [dialog, setDialog] = useState<{
    key: number;
    initial?: Partial<AccountFormValue>;
  } | null>(null);
  const [, start] = useTransition();
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  const groups = [
    {
      key: "shared",
      title: tc("shared"),
      items: active.filter((a) => a.isShared),
    },
    ...members.map((m) => ({
      key: m.id,
      title:
        m.id === currentUserId
          ? t("groups.yours")
          : t("groups.member", { name: m.displayName }),
      items: active.filter((a) => !a.isShared && a.owners[0]?.userId === m.id),
    })),
  ].filter((g) => g.items.length > 0);

  const open = (initial?: Partial<AccountFormValue>) =>
    setDialog((d) => ({ key: (d?.key ?? 0) + 1, initial }));

  const archive = (id: string, value: boolean) =>
    start(async () => {
      const result = await archiveAccountAction(id, value);
      if (result.ok)
        toast.success(value ? t("toasts.archived") : t("toasts.restored"));
      else toast.error(result.error);
    });

  const card = (a: AccountItem) => (
    <Card
      key={a.id}
      className={cn(
        "relative overflow-hidden py-0",
        a.archived && "opacity-60",
      )}
    >
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: a.bankColor }}
      />
      <CardContent className="space-y-3 p-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <BankLogo
            bankId={a.bankId}
            name={a.bankName}
            color={a.bankColor}
            size={36}
            className="rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{a.name}</p>
            <p className="text-xs text-muted-foreground">
              {a.bankName} · {tc(`accountTypes.${a.type}`)}
              {a.ibanLast4 && ` · •••• ${a.ibanLast4}`}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t("card.actions")}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  open({
                    id: a.id,
                    bankId: a.bankId,
                    name: a.name,
                    type: a.type,
                    isPrivate: a.isPrivate,
                    ibanLast4: a.ibanLast4,
                    owners: a.owners.map(({ userId, sharePct }) => ({
                      userId,
                      sharePct,
                    })),
                  })
                }
              >
                <Pencil /> {tc("actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => archive(a.id, !a.archived)}>
                {a.archived ? <ArchiveRestore /> : <Archive />}{" "}
                {a.archived ? t("card.restore") : t("card.archive")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div>
          <p className="text-xl font-semibold">
            {a.balanceCents === null ? (
              "—"
            ) : (
              <Money cents={a.balanceCents} currency={a.currency} />
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {a.balanceDate
              ? t("card.balanceOn", { date: formatDate(a.balanceDate, locale) })
              : t("card.noStatements")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {a.isShared && (
            <Badge variant="secondary" className="gap-1">
              <Users className="size-3" />
              {a.owners
                .map((o) => `${o.displayName} ${o.sharePct}%`)
                .join(" · ")}
            </Badge>
          )}
          {a.isPrivate && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" /> {tc("private")}
            </Badge>
          )}
          {!a.ibanLast4 && <Badge variant="outline">{t("card.noIban")}</Badge>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      {active.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Landmark className="size-10 text-muted-foreground" />
            <p className="font-medium">{t("empty.title")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("empty.description")}
            </p>
            <Button onClick={() => open()}>
              <Plus /> {t("addAccount")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {g.title}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map(card)}
            </div>
          </section>
        ))
      )}

      {active.length > 0 && (
        <Button variant="outline" onClick={() => open()}>
          <Plus /> {t("addAccount")}
        </Button>
      )}

      {archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("groups.archived")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map(card)}
          </div>
        </section>
      )}

      {dialog && (
        <AccountDialog
          key={dialog.key}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          banks={banks}
          members={members}
          currentUserId={currentUserId}
          initial={dialog.initial}
        />
      )}
    </div>
  );
}
