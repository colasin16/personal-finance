"use client";

import {
  Baby, Banknote, Briefcase, Car, CircleDashed, CircleEllipsis, CircleHelp, Coins, Dumbbell, Gift, GraduationCap, HeartPulse, Home,
  Landmark, type LucideIcon, PawPrint, PiggyBank, Plane, Repeat, Shield, ShoppingBag, ShoppingBasket, Tag, TrainFront, Utensils, Zap, ArrowLeftRight,
} from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { cn } from "@/lib/utils";

/** Icons used by the default categories are bundled; any other Lucide icon is loaded on demand. */
const BUNDLED_ICONS: Record<string, LucideIcon> = {
  home: Home,
  zap: Zap,
  "shopping-basket": ShoppingBasket,
  utensils: Utensils,
  "train-front": TrainFront,
  car: Car,
  "heart-pulse": HeartPulse,
  dumbbell: Dumbbell,
  "graduation-cap": GraduationCap,
  "shopping-bag": ShoppingBag,
  plane: Plane,
  repeat: Repeat,
  shield: Shield,
  landmark: Landmark,
  baby: Baby,
  "paw-print": PawPrint,
  gift: Gift,
  banknote: Banknote,
  "circle-ellipsis": CircleEllipsis,
  briefcase: Briefcase,
  coins: Coins,
  "piggy-bank": PiggyBank,
  "arrow-left-right": ArrowLeftRight,
  tag: Tag,
  "circle-dashed": CircleDashed,
  "circle-help": CircleHelp,
};

/** Names stored while the app briefly used the Carbon and Solar sets, mapped back to Lucide. */
const LEGACY_ICONS: Record<string, string> = {
  "home-2": "home",
  bolt: "zap",
  lightning: "zap",
  "cart-2": "shopping-basket",
  "cart-large-2": "shopping-basket",
  "shopping-cart": "shopping-basket",
  "chef-hat": "utensils",
  restaurant: "utensils",
  tram: "train-front",
  train: "train-front",
  pills: "heart-pulse",
  running: "dumbbell",
  "square-academic-cap": "graduation-cap",
  education: "graduation-cap",
  bag: "shopping-bag",
  security: "shield",
  bill: "landmark",
  receipt: "landmark",
  "smile-circle": "baby",
  "pedestrian-child": "baby",
  paw: "paw-print",
  "dog-walker": "paw-print",
  "banknote-2": "banknote",
  money: "banknote",
  "menu-dots": "circle-ellipsis",
  "overflow-menu-horizontal": "circle-ellipsis",
  case: "briefcase",
  portfolio: "briefcase",
  euro: "coins",
  currency: "coins",
  "safe-2": "piggy-bank",
  "transfer-horizontal": "arrow-left-right",
  "arrows-horizontal": "arrow-left-right",
  circle: "circle-dashed",
  "circle-dash": "circle-dashed",
  "question-circle": "circle-help",
  help: "circle-help",
};

export const UNCATEGORIZED_COLOR = "#f59e0b";
export const UNCATEGORIZED_ICON = "tag";

export function CategoryIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const name = icon ? (LEGACY_ICONS[icon] ?? icon) : UNCATEGORIZED_ICON;
  const cls = cn("size-3.5 shrink-0", className);
  const Bundled = BUNDLED_ICONS[name];
  if (Bundled) return <Bundled aria-hidden="true" className={cls} />;
  return <DynamicIcon name={name as IconName} aria-hidden="true" className={cls} fallback={() => <CircleDashed aria-hidden="true" className={cls} />} />;
}

/** Translucent border/background derived from a category color; also exposes it as `--category` for the text tone. */
export function categoryTint(color: string) {
  return {
    "--category": color,
    borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
  } as React.CSSProperties;
}

/** Category color darkened in light mode and lightened in dark mode so text stays readable on the tint. */
const CATEGORY_TEXT = "text-[color-mix(in_srgb,var(--category)_65%,black)] dark:text-[color-mix(in_srgb,var(--category)_70%,white)]";

/** Icon + name pill; the category color drives the text, border and a translucent background. */
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
      className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium", CATEGORY_TEXT, className)}
      style={categoryTint(color)}
    >
      <CategoryIcon icon={icon} />
      <span className="truncate">{name}</span>
    </span>
  );
}
