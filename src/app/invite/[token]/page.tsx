import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSystemDb } from "@/lib/db";
import { getInvite, getMembership, inviteMatchesUser } from "@/lib/households";
import { getCurrentUser } from "@/lib/server/auth";
import { AcceptInviteButton } from "@/app/onboarding/onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.invite"))("title") };
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/invite/${encodeURIComponent(token)}`);
  const db = await getSystemDb();
  const invite = await getInvite(db, token);
  const membership = await getMembership(db, user.id);
  const t = await getTranslations("auth.invite");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <Logo className="text-lg" />
      <Card className="w-full max-w-md">
        {!invite ? (
          <CardHeader>
            <CardTitle>{t("invalidTitle")}</CardTitle>
            <CardDescription>{t("invalidDescription")}</CardDescription>
          </CardHeader>
        ) : !inviteMatchesUser(invite.invite, user) ? (
          <CardHeader>
            <CardTitle>{t("wrongEmailTitle")}</CardTitle>
            <CardDescription>{t("wrongEmailDescription", { email: user.email })}</CardDescription>
          </CardHeader>
        ) : membership ? (
          <CardHeader>
            <CardTitle>{t("alreadyMemberTitle", { household: membership.household.name })}</CardTitle>
            <CardDescription>{t("alreadyMemberDescription")}</CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>{t("joinTitle", { household: invite.householdName })}</CardTitle>
              <CardDescription>{t("joinDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptInviteButton token={token} label={t("accept")} />
            </CardContent>
          </>
        )}
        {(!invite || membership || !inviteMatchesUser(invite.invite, user)) && (
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard">{t("goToDashboard")}</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
