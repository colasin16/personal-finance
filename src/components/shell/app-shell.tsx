"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRight,
  CircleAlert,
  FileUp,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
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
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UploadProvider } from "./upload-provider";

type Props = {
  user: { id: string; displayName: string; email: string };
  household: { name: string };
  members: { id: string; displayName: string }[];
  issuesCount: number;
  modes: { service: string; value: string; mocked: boolean }[];
  children: React.ReactNode;
};

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/import", label: "Import", icon: FileUp },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/issues", label: "Issues", icon: CircleAlert },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function AppShell({ user, household, members, issuesCount, modes, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mockedCount = modes.filter((m) => m.mocked).length;

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/import" && pathname.startsWith("/statements"));
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
            {href === "/issues" && issuesCount > 0 && (
              <Badge className="ml-auto h-5 min-w-5 rounded-full bg-amber-500 px-1.5 text-white hover:bg-amber-500">{issuesCount}</Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const modeInfo = (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted">
          <span className="size-2 rounded-full bg-amber-500" />
          {mockedCount > 0 ? `Offline mode · ${mockedCount} services mocked` : "All services live"}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80">
        <p className="mb-2 text-sm font-medium">Service adapters</p>
        <ul className="space-y-1.5 text-xs">
          {modes.map((m) => (
            <li key={m.service} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{m.service}</span>
              <span className={cn("text-right font-medium", m.mocked && "text-amber-600 dark:text-amber-400")}>{m.value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Set the variables in .env.example to switch to real services.</p>
      </PopoverContent>
    </Popover>
  );

  return (
    <UploadProvider>
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-6 border-r bg-background p-4 transition-transform md:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between">
            <Link href="/dashboard">
              <Logo />
            </Link>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
              <X />
            </Button>
          </div>
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
            <Link href="/import" onClick={() => setOpen(false)}>
              <Upload /> Upload statements
            </Link>
          </Button>
          {nav}
          {modeInfo}
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={() => setOpen(false)} />}

        <div className="flex min-w-0 flex-1 flex-col md:pl-64">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-8">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu />
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
                    <Link href="/settings">
                      <Settings /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void signOut()}>
                    <LogOut /> Sign out
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
