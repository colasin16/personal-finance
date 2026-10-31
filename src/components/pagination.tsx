"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, pageRange } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * URL-driven pagination: numbered pages with first/last and ellipses, a page-size selector and (for long lists)
 * a jump-to-page box. Keeps every other search param, using `page` and `size`.
 */
export function Pagination({
  page,
  pages,
  pageSize,
  total,
  showRange = true,
  className,
}: {
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  /** Show "Showing 51–100 of 1,234". */
  showRange?: boolean;
  className?: string;
}) {
  const t = useTranslations("common.pagination");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [jump, setJump] = useState("");
  const jumpId = useId();

  const href = (changes: { page?: number; size?: number }) => {
    const next = new URLSearchParams(params);
    if (changes.page !== undefined) {
      if (changes.page > 1) next.set("page", String(changes.page));
      else next.delete("page");
    }
    if (changes.size !== undefined) {
      if (changes.size !== DEFAULT_PAGE_SIZE) next.set("size", String(changes.size));
      else next.delete("size");
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  if (total === 0) return null;
  const nf = new Intl.NumberFormat(locale);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const nav = (target: number, label: string, icon: ReactNode, disabled: boolean) =>
    disabled ? (
      <Button variant="outline" size="icon" disabled aria-label={label}>
        {icon}
      </Button>
    ) : (
      <Button asChild variant="outline" size="icon" aria-label={label}>
        <Link href={href({ page: target })}>{icon}</Link>
      </Button>
    );

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-sm", className)}>
      {showRange && (
        <span className="text-muted-foreground">{t("showing", { from: nf.format(from), to: nf.format(to), total: nf.format(total) })}</span>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-muted-foreground">
          {t("perPage")}
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              const size = Number(v);
              // Stay on the page that contains the first row currently shown.
              router.push(href({ size, page: Math.floor((from - 1) / size) + 1 }));
            }}
          >
            <SelectTrigger size="sm" className="w-20" aria-label={t("perPage")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {pages > 1 && (
          <nav aria-label={t("label")} className="flex items-center gap-1">
            {nav(1, t("first"), <ChevronsLeft />, page <= 1)}
            {nav(page - 1, t("previous"), <ChevronLeft />, page <= 1)}
            {pageRange(page, pages).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden>
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  asChild
                  variant={p === page ? "default" : "ghost"}
                  size="sm"
                  className="hidden min-w-8 justify-center tabular-nums sm:inline-flex"
                >
                  <Link href={href({ page: p })} aria-label={t("page", { page: p })} aria-current={p === page ? "page" : undefined}>
                    {nf.format(p)}
                  </Link>
                </Button>
              ),
            )}
            <span className="px-1 text-muted-foreground tabular-nums sm:hidden">{t("pageOf", { page, total: pages })}</span>
            {nav(page + 1, t("next"), <ChevronRight />, page >= pages)}
            {nav(pages, t("last"), <ChevronsRight />, page >= pages)}
          </nav>
        )}
        {pages > 7 && (
          <form
            className="flex items-center gap-2 text-muted-foreground"
            onSubmit={(e) => {
              e.preventDefault();
              const target = Number.parseInt(jump, 10);
              if (!Number.isFinite(target)) return;
              setJump("");
              router.push(href({ page: Math.min(pages, Math.max(1, target)) }));
            }}
          >
            <label htmlFor={jumpId}>{t("goTo")}</label>
            <Input
              id={jumpId}
              type="number"
              inputMode="numeric"
              min={1}
              max={pages}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              placeholder={String(page)}
              className="h-7 w-16"
            />
          </form>
        )}
      </div>
    </div>
  );
}
