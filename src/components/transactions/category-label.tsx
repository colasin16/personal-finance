import { CARBON_ICONS } from "@/lib/carbon-icons";
import { cn } from "@/lib/utils";

/** Maps icon names stored before the move to Carbon (Lucide names) to Carbon icon names. */
const LEGACY_ICONS: Record<string, string> = {
  zap: "lightning",
  "shopping-basket": "shopping-cart",
  utensils: "restaurant",
  "train-front": "train",
  "heart-pulse": "pills",
  dumbbell: "running",
  "graduation-cap": "education",
  shield: "security",
  landmark: "receipt",
  baby: "pedestrian-child",
  "paw-print": "dog-walker",
  banknote: "money",
  "circle-ellipsis": "overflow-menu-horizontal",
  briefcase: "portfolio",
  coins: "currency",
  "arrow-left-right": "arrows-horizontal",
  circle: "circle-dash",
  "circle-help": "help",
};

export const UNCATEGORIZED_COLOR = "#f59e0b";

export function CategoryIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const name = icon ? (LEGACY_ICONS[icon] ?? icon) : "tag";
  const body = CARBON_ICONS[name] ?? CARBON_ICONS["circle-dash"];
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0", className)}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

/** Translucent border/background derived from a category color. */
export function categoryTint(color: string) {
  return {
    borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
  };
}

/** Icon + name pill; the category color drives the border and a translucent background (darker in dark mode, softer in light mode). */
export function CategoryLabel({
  name,
  icon,
  color,
  className,
}: {
  name: string;
  icon?: string | null;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium", className)}
      style={categoryTint(color)}
    >
      <CategoryIcon icon={icon} />
      <span className="truncate">{name}</span>
    </span>
  );
}
