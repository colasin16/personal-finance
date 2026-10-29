import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("settings");
  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="min-w-0 md:sticky md:top-20 md:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0 max-w-4xl">{children}</div>
      </div>
    </>
  );
}
