import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitch } from "@/components/theme/language-switch";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { getMembership, pendingInvitesFor } from "@/lib/households";
import { requireUser } from "@/lib/server/auth";
import { AcceptInviteButton, CreateHouseholdForm } from "./onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.onboarding"))("title") };
}

export default async function OnboardingPage() {
  const user = await requireUser();
  const db = await getDb();
  if (await getMembership(db, user.id)) redirect("/dashboard");
  const invites = await pendingInvitesFor(db, user.email);
  const t = await getTranslations("auth.onboarding");

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <LanguageSwitch />
        <ThemeToggle />
      </div>
      <Logo className="text-lg" />
      <div className="w-full max-w-md space-y-4">
        {invites.map((invite) => (
          <Card key={invite.token} className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30">
            <CardHeader>
              <CardTitle>{t("invitedTitle", { household: invite.householdName })}</CardTitle>
              <CardDescription>{t("invitedDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptInviteButton token={invite.token} label={t("join")} />
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>{t("setupTitle", { name: user.displayName })}</CardTitle>
            <CardDescription>{t("setupDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateHouseholdForm defaultName={t("defaultHouseholdName", { name: user.displayName })} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
