import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/server/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(next?.startsWith("/") ? next : "/dashboard");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <Logo className="text-lg" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Drop in your bank statements, we&apos;ll do the rest.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} demoEnabled={process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO === "1"} />
        </CardContent>
      </Card>
    </main>
  );
}
