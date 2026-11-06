"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Theme radio options, for embedding in another dropdown menu. */
export function ThemeRadioGroup() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("common.theme");
  return (
    <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
      <DropdownMenuRadioItem value="light">
        <Sun /> {t("light")}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">
        <Moon /> {t("dark")}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="system">
        <Monitor /> {t("system")}
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("common.theme");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label={t("label")}>
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeRadioGroup />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
