"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LOCALE_NAMES, LOCALES } from "@/i18n/config";
import { setLocaleAction } from "@/lib/actions/preferences";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function useLocaleChange() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const change = (value: string) =>
    start(async () => {
      await setLocaleAction(value);
      router.refresh();
    });
  return { locale, pending, change };
}

/** Locale radio options, for embedding in another dropdown menu. */
export function LanguageRadioGroup() {
  const { locale, change } = useLocaleChange();
  return (
    <DropdownMenuRadioGroup value={locale} onValueChange={change}>
      {LOCALES.map((l) => (
        <DropdownMenuRadioItem key={l} value={l} lang={l}>
          {LOCALE_NAMES[l]}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export function LanguageSwitch({ className }: { className?: string }) {
  const t = useTranslations("common");
  const { locale, pending, change } = useLocaleChange();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className} aria-label={t("language")} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Languages />}
          <span className="uppercase">{locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={change}>
          {LOCALES.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l}>
              {LOCALE_NAMES[l]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
