import type { Metadata } from "next";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { householdInvites } from "@/lib/db/schema";
import { getMembers } from "@/lib/households";
import { requireContext } from "@/lib/server/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HouseholdNameForm, InviteForm } from "../settings-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("household.title")} · ${t("title")}` };
}

export default async function HouseholdSettingsPage() {
  const { db, user, household } = await requireContext();
  const t = await getTranslations("settings");
  const [members, invites] = await Promise.all([
    getMembers(db, household.id),
    db
      .select()
      .from(householdInvites)
      .where(and(eq(householdInvites.householdId, household.id), isNull(householdInvites.acceptedAt), gt(householdInvites.expiresAt, new Date()))),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("household.title")}</CardTitle>
        <CardDescription>{t("household.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <HouseholdNameForm name={household.name} />
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("household.members")}</p>
          <ul className="divide-y rounded-lg border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  {m.displayName} {m.id === user.id && <span className="text-muted-foreground">{t("household.you")}</span>}
                  <span className="block text-xs text-muted-foreground">{m.email}</span>
                </span>
                <Badge variant="secondary">{t(`household.roles.${m.role}`)}</Badge>
              </li>
            ))}
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground">
                <span>{i.email}</span>
                <Badge variant="outline">{t("household.invited")}</Badge>
              </li>
            ))}
          </ul>
        </div>
        <InviteForm />
      </CardContent>
    </Card>
  );
}
