import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/auth-page";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmEmailLink } from "@/lib/actions/auth";
import { safeNext } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/server/auth";
import { ConfirmButton } from "./confirm-button";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.confirm"))("title") };
}

/** Where the email link lands: one click confirms it (see `confirmEmailLink`). */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;
  if (!token_hash) redirect("/login");
  if (await getCurrentUser()) redirect(safeNext(next));
  const t = await getTranslations("auth.confirm");
  return (
    <AuthPage>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={confirmEmailLink}>
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="type" value={type ?? "email"} />
          <input type="hidden" name="next" value={next ?? ""} />
          <ConfirmButton>{t("continue")}</ConfirmButton>
        </form>
      </CardContent>
    </AuthPage>
  );
}
