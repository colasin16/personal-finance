import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { serviceModes } from "@/lib/services/modes";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("about.title")} · ${t("title")}` };
}

export default async function AboutSettingsPage() {
  const t = await getTranslations("settings");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("about.title")}</CardTitle>
        <CardDescription>{t("about.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ul className="space-y-1.5">
          {serviceModes().map((m) => (
            <li key={m.key} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t(`services.labels.${m.key}`)}</span>
              <span className="text-right">
                {t(`services.values.${m.value}`)}
                {m.detail && ` (${m.detail})`}{" "}
                {m.mocked && (
                  <Badge variant="outline" className="ml-1 text-amber-700 dark:text-amber-400">
                    {t("services.mock")}
                  </Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          {t.rich("about.credits", {
            link: (c) => (
              <a className="underline" href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
                {c}
              </a>
            ),
          })}
        </p>
      </CardContent>
    </Card>
  );
}
