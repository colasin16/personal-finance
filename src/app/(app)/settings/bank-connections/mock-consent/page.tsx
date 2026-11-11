import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BANK_CALLBACK_PATH } from "@/lib/bank-sync";
import { getBankSyncProvider } from "@/lib/services/bank-sync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Stand-in for a bank's consent screen, only while the mock bank provider is active (no Enable Banking keys). */
export default async function MockConsentPage({ searchParams }: { searchParams: Promise<{ bank?: string; state?: string; grant?: string }> }) {
  if (getBankSyncProvider().id !== "mock") notFound();
  const { bank = "", state = "", grant = "" } = await searchParams;
  const t = await getTranslations("bankSync");
  const callback = (params: Record<string, string>) => `${BANK_CALLBACK_PATH}?${new URLSearchParams({ ...params, state })}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("mock.title", { bank })}</CardTitle>
        <CardDescription>{t("mock.body")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild>
          <a href={callback({ code: grant })}>{t("mock.approve")}</a>
        </Button>
        <Button asChild variant="ghost">
          <a href={callback({ error: "access_denied" })}>{t("mock.cancel")}</a>
        </Button>
      </CardContent>
    </Card>
  );
}
