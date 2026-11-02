"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HEX_PATTERN, normalizeHex, randomColor, readableOn } from "@/lib/colors";
import { cn } from "@/lib/utils";

/** Category colour picker: a randomise button showing the colour plus an editable hex value. */
export function ColorInput({ value, onChange, id, className }: { value: string; onChange: (color: string) => void; id?: string; className?: string }) {
  const t = useTranslations("settings.categories");
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    if (normalizeHex(draft) !== value) setDraft(value);
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        size="icon"
        className="shrink-0 border-0 hover:opacity-90"
        style={{ background: value, color: readableOn(value) }}
        onClick={() => {
          const c = randomColor();
          setDraft(c);
          onChange(c);
        }}
        aria-label={t("randomColor")}
        title={t("randomColor")}
      >
        <RefreshCw />
      </Button>
      <Input
        id={id}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const c = normalizeHex(e.target.value);
          if (c) onChange(c);
        }}
        onBlur={() => setDraft(normalizeHex(draft) ?? value)}
        pattern={HEX_PATTERN}
        required
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        aria-label={t("hexColor")}
        aria-invalid={normalizeHex(draft) === null}
        className="w-32 font-mono"
      />
    </div>
  );
}
