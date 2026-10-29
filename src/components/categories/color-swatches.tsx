"use client";

export const CATEGORY_COLORS = ["#6366f1", "#22c55e", "#f97316", "#ec4899", "#14b8a6", "#eab308", "#8b5cf6", "#ef4444", "#0ea5e9", "#64748b"];

/** Category colour choice; a current colour outside the palette (e.g. from the defaults) stays selectable. */
export function ColorSwatches({ value, onChange, label }: { value: string; onChange: (color: string) => void; label: string }) {
  const colors = CATEGORY_COLORS.some((c) => c.toLowerCase() === value.toLowerCase()) ? CATEGORY_COLORS : [value, ...CATEGORY_COLORS];
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c.toLowerCase() === value.toLowerCase()}
          aria-label={c}
          onClick={() => onChange(c)}
          className="size-6 rounded-full ring-offset-2 ring-offset-background aria-checked:ring-2 aria-checked:ring-foreground"
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
