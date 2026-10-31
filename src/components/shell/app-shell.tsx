"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  CircleAlert,
  FileUp,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Upload,
  X,
} from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { Logo } from "@/components/brand/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LanguageSwitch } from "@/components/theme/language-switch";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { ServiceMode } from "@/lib/services/modes";
import { SIDEBAR_COOKIE, type SidebarState } from "./sidebar-state";
import { UploadProvider } from "./upload-provider";

type Props = {
  user: { id: string; displayName: string; email: string };
  household: { name: string };
  members: { id: string; displayName: string }[];
  issuesCount: number;
  modes: ServiceMode[];
  sidebar: SidebarState;
  children: React.ReactNode;
};

const NAV = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/import", key: "import", icon: FileUp },
  { href: "/transactions", key: "transactions", icon: ArrowLeftRight },
  { href: "/issues", key: "issues", icon: CircleAlert },
  { href: "/accounts", key: "accounts", icon: Landmark },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

const RAIL_QUERY = "(min-width: 48rem)";
const AUTO_RAIL_QUERY = "(min-width: 48rem) and (max-width: 63.999rem)";

/** Whether the desktop sidebar is currently rendered as an icon rail (mirrors the `rail:` CSS variant). */
function useIsRail(state: SidebarState) {
  const [rail, setRail] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia(RAIL_QUERY);
    const tablet = window.matchMedia(AUTO_RAIL_QUERY);
    const update = () => setRail(desktop.matches && (state === "collapsed" || (state === "auto" && tablet.matches)));
    update();
    desktop.addEventListener("change", update);
    tablet.addEventListener("change", update);
    return () => {
      desktop.removeEventListener("change", update);
      tablet.removeEventListener("change", update);
    };
  }, [state]);
  return rail;
}

function RailTooltip({ label, enabled, children }: { label: string; enabled: boolean; children: React.ReactElement }) {
  if (!enabled) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function AppShell({ user, household, members, issuesCount, modes, sidebar: initialSidebar, children }: Props) {
  const pathname = usePathname();
  const t = useTranslations("shell");
  const ts = useTranslations("settings");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [sidebar, setSidebar] = useState(initialSidebar);
  const rail = useIsRail(sidebar);
  const mockedCount = modes.filter((m) => m.mocked).length;

  const toggleSidebar = () => {
    const next = rail ? "expanded" : "collapsed";
    setSidebar(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map(({ href, key, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/import" && pathname.startsWith("/statements"));
        const label = t(`nav.${key}`);
        const showCount = href === "/issues" && issuesCount > 0;
        return (
          <RailTooltip key={href} label={showCount ? `${label} (${issuesCount})` : label} enabled={rail}>
            <Link
              href={href}
              onClick={() => setOpen(false)}
              aria-label={rail ? label : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground rail:justify-center rail:px-0",
                active && "bg-muted text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate rail:sr-only">{label}</span>
              {showCount && (
                <Badge className="ml-auto h-5 min-w-5 rounded-full bg-amber-500 px-1.5 text-white hover:bg-amber-500 rail:absolute rail:top-0.5 rail:right-1 rail:h-4 rail:min-w-4 rail:px-1 rail:text-[10px]">
                  {issuesCount}
                </Badge>
              )}
            </Link>
          </RailTooltip>
        );
      })}
    </nav>
  );

  const modeInfo = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title={rail ? (mockedCount > 0 ? t("offlineMode", { count: mockedCount }) : t("allLive")) : undefined}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted rail:justify-center rail:px-0"
        >
          <span className="size-2 shrink-0 rounded-full bg-amber-500" />
          <span className="rail:sr-only">{mockedCount > 0 ? t("offlineMode", { count: mockedCount }) : t("allLive")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80">
        <p className="mb-2 text-sm font-medium">{t("serviceAdapters")}</p>
        <ul className="space-y-1.5 text-xs">
          {modes.map((m) => (
            <li key={m.key} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{ts(`services.labels.${m.key}`)}</span>
              <span className={cn("text-right font-medium", m.mocked && "text-amber-600 dark:text-amber-400")}>
                {ts(`services.values.${m.value}`)}
                {m.detail && ` (${m.detail})`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{t("switchHint")}</p>
      </PopoverContent>
    </Popover>
  );

  return (
    <UploadProvider>
      <div className="flex min-h-screen" data-sidebar={sidebar}>
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-6 overflow-x-hidden border-r bg-background p-4 transition-[translate,width] md:translate-x-0 rail:w-16 rail:px-2",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between rail:justify-center">
            <Link href="/dashboard" aria-label={rail ? tc("appName") : undefined}>
              <Logo textClassName="whitespace-nowrap rail:sr-only" />
            </Link>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(false)} aria-label={t("closeMenu")}>
              <X />
            </Button>
          </div>
          <RailTooltip label={t("uploadStatements")} enabled={rail}>
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700 rail:px-0">
              <Link href="/import" onClick={() => setOpen(false)} aria-label={rail ? t("uploadStatements") : undefined}>
                <Upload /> <span className="rail:sr-only">{t("uploadStatements")}</span>
              </Link>
            </Button>
          </RailTooltip>
          {nav}
          {modeInfo}
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={() => setOpen(false)} />}

        <div className="flex min-w-0 flex-1 flex-col transition-[padding] md:pl-64 rail:pl-16">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-8">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label={t("openMenu")}>
              <Menu />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 hidden md:inline-flex"
              onClick={toggleSidebar}
              aria-label={rail ? t("expandSidebar") : t("collapseSidebar")}
              title={rail ? t("expandSidebar") : t("collapseSidebar")}
            >
              {rail ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{household.name}</span>
              <div className="flex -space-x-2">
                {members.map((m) => (
                  <Avatar key={m.id} className="size-6 border-2 border-background" title={m.displayName}>
                    <AvatarFallback className="text-[10px]">{initials(m.displayName)}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <LanguageSwitch />
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 px-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-emerald-100 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{initials(user.displayName)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm sm:inline">{user.displayName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="text-sm font-medium">{user.displayName}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings/household">
                      <Settings /> {t("nav.settings")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void signOut()}>
                    <LogOut /> {t("signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </UploadProvider>
  );
}
