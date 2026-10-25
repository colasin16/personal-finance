import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { getInvite, getMembership } from "@/lib/households";
import { getCurrentUser } from "@/lib/server/auth";
import { AcceptInviteButton } from "@/app/onboarding/onboarding-form";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/invite/${encodeURIComponent(token)}`);
  const db = await getDb();
  const invite = await getInvite(db, token);
  const membership = await getMembership(db, user.id);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <Logo className="text-lg" />
      <Card className="w-full max-w-md">
        {!invite ? (
          <CardHeader>
            <CardTitle>This invitation is no longer valid</CardTitle>
            <CardDescription>It may have expired or already been used. Ask your partner for a new link.</CardDescription>
          </CardHeader>
        ) : membership ? (
          <CardHeader>
            <CardTitle>You already belong to “{membership.household.name}”</CardTitle>
            <CardDescription>Each person can be in one household. Sign in with another email to accept this invite.</CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Join “{invite.householdName}”</CardTitle>
              <CardDescription>
                You&apos;ll see the household&apos;s shared accounts and can upload statements together. Accounts marked private stay private.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptInviteButton token={token} label="Accept invitation" />
            </CardContent>
          </>
        )}
        {(!invite || membership) && (
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
