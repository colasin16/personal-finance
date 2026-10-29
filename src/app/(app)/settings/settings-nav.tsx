"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Info, Tags, Users, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const SETTINGS_SECTIONS = [
  { href: "/settings/household", key: "household", icon: Users },
  { href: "/settings/categories", key: "categories", icon: Tags },
  { href: "/settings/rules", key: "rules", icon: WandSparkles },
  { href: "/settings/about", key: "about", icon: Info },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  const t = useTranslations("settings");

  return (
    <nav aria-label={t("title")} className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:overflow-visible md:px-0">
      {SETTINGS_SECTIONS.map(({ href, key, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted text-foreground",
            )}
          >
            <Icon className="size-4" />
            {t(`${key}.title`)}
          </Link>
        );
      })}
    </nav>
  );
}
