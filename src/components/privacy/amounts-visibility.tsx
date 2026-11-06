"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PRIVACY_COOKIE } from "@/lib/privacy";

type AmountsVisibility = { hidden: boolean; toggle: () => void };

// Outside the provider (landing page, sample data) amounts are always shown.
const AmountsVisibilityContext = createContext<AmountsVisibility>({ hidden: false, toggle: () => {} });

export const useAmountsVisibility = () => useContext(AmountsVisibilityContext);

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function AmountsVisibilityProvider({ initialHidden, children }: { initialHidden: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(initialHidden);

  const toggle = useCallback(() => {
    const next = !hidden;
    setHidden(next);
    document.cookie = `${PRIVACY_COOKIE}=${next ? "hidden" : "shown"}; path=/; max-age=31536000; samesite=lax`;
    // Server components format some amounts themselves (dashboard KPIs): re-render them with the new cookie.
    router.refresh();
  }, [hidden, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && event.code === "KeyH" && !isTyping(event.target)) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <AmountsVisibilityContext.Provider value={value}>{children}</AmountsVisibilityContext.Provider>;
}

export function AmountsToggle({ className }: { className?: string }) {
  const { hidden, toggle } = useAmountsVisibility();
  const t = useTranslations("common.privacy");
  const label = `${hidden ? t("show") : t("hide")} (Shift+H)`;
  return (
    <Button variant="ghost" size="icon" className={className} onClick={toggle} aria-pressed={hidden} aria-label={label} title={label}>
      {hidden ? <EyeOff /> : <Eye />}
    </Button>
  );
}
