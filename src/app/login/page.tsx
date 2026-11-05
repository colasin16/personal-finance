import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/auth-page";
import { safeNext } from "@/lib/safe-next";
import { authMode, getCurrentUser } from "@/lib/server/auth";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.login"))("title") };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));
  const mode = authMode();
  return (
    <AuthPage>
      <LoginForm
        next={next}
        mode={mode}
        linkError={error === "link_invalid"}
        demoEnabled={mode === "mock" && (process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO === "1")}
      />
    </AuthPage>
  );
}
