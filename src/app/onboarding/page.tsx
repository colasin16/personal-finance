import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { getMembership, pendingInvitesFor } from "@/lib/households";
import { requireUser } from "@/lib/server/auth";
import { AcceptInviteButton, CreateHouseholdForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const db = await getDb();
  if (await getMembership(db, user.id)) redirect("/dashboard");
  const invites = await pendingInvitesFor(db, user.email);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <ThemeToggle className="absolute top-4 right-4" />
      <Logo className="text-lg" />
      <div className="w-full max-w-md space-y-4">
        {invites.map((invite) => (
          <Card key={invite.token} className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30">
            <CardHeader>
              <CardTitle>You&apos;re invited to “{invite.householdName}”</CardTitle>
              <CardDescription>Join to see and manage your shared accounts together.</CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptInviteButton token={invite.token} label="Join household" />
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>Hi {user.displayName}, let&apos;s set up your household</CardTitle>
            <CardDescription>
              A household holds your accounts and those you share with your partner. You can invite them in the next step.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateHouseholdForm defaultName={`${user.displayName}'s household`} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
