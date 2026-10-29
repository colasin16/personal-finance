"use client";

import { useState } from "react";
import { bankLogoUrl } from "@/lib/banks";
import { cn } from "@/lib/utils";

/** Picks black or white text for a hex background (WCAG relative luminance). */
function textOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#18181b" : "#ffffff";
}

/**
 * Bank symbol from Brandfetch, falling back to a coloured lettermark offline or when the logo is missing.
 * `bare` drops the white tile and ring so the logo keeps its own shape (for small, tightly-rounded inline uses).
 */
export function BankLogo({
  bankId,
  name,
  color,
  size = 20,
  bare = false,
  className,
}: {
  bankId: string;
  name: string;
  color: string;
  size?: number;
  bare?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = bankLogoUrl(bankId, size);
  const box = cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md", className);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Brandfetch requires hotlinking; next/image would proxy the file.
      <img src={src} alt={name} width={size} height={size} loading="lazy"
        // Inline size beats Tailwind preflight's `height: auto; max-width: 100%`, which let non-square logos keep their own aspect ratio.
        style={{ width: size, height: size }}
        className={cn(box, "object-contain", !bare && "bg-white ring-1 ring-border")}
        onError={() => setFailed(true)} />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(box, "font-semibold select-none")}
      style={{ width: size, height: size, background: color, color: textOn(color), fontSize: Math.round(size * 0.5) }}
    >
      {name.replace(/^Banco\s+/i, "").charAt(0).toUpperCase()}
    </span>
  );
}
