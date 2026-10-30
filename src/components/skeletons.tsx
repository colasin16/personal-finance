import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "cn";

/** Varied widths so skeleton rows look like real, uneven content. */
const pick = (widths: string[], i: number) => widths[i % widths.length];

/** Wraps a page's loading state; `aria-busy` tells assistive tech the content is on its way. */
export function LoadingPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-busy="true" className={className}>
      {children}
    </div>
  );
}

/** Same footprint as <PageHeader> when the title itself depends on data. */
export function PageHeaderSkeleton({ actions = 0 }: { actions?: number }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className={cn("h-9", i === actions - 1 ? "w-40" : "w-28")} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A small stat card (label + amount), as on the dashboard and statement pages. */
export function StatCardSkeleton({ label, size = "lg" }: { label: string; size?: "lg" | "md" }) {
  return size === "lg" ? (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1 px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Skeleton className="my-1 h-7 w-36" />
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  ) : (
    <Card className="py-0">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Skeleton className="mt-1 h-6 w-28" />
      </CardContent>
    </Card>
  );
}

/** Mirrors <TransactionTable>: real column headers, placeholder rows. */
export function TransactionTableSkeleton({
  rows = 10,
  showAccount = true,
  showBalance = false,
}: {
  rows?: number;
  showAccount?: boolean;
  showBalance?: boolean;
}) {
  const t = useTranslations("transactions.table");
  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Skeleton className="size-4 rounded-[4px]" />
            </TableHead>
            <TableHead className="w-28">{t("date")}</TableHead>
            <TableHead>{t("description")}</TableHead>
            {showAccount && <TableHead className="hidden lg:table-cell">{t("account")}</TableHead>}
            <TableHead className="w-52">{t("category")}</TableHead>
            <TableHead className="text-right">{t("amount")}</TableHead>
            {showBalance && <TableHead className="hidden text-right md:table-cell">{t("balance")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, i) => (
            <TableRow key={i} className="h-[53px]">
              <TableCell>
                <Skeleton className="size-4 rounded-[4px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell className="w-full max-w-0">
                <Skeleton className={cn("h-4", pick(["w-40", "w-32", "w-48", "w-36"], i))} />
                <Skeleton className={cn("mt-1.5 h-3 max-w-full", pick(["w-64", "w-56", "w-72", "w-48"], i))} />
              </TableCell>
              {showAccount && (
                <TableCell className="hidden lg:table-cell">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="size-4 rounded-[3px]" />
                    <Skeleton className={cn("h-4", pick(["w-36", "w-32", "w-40"], i))} />
                  </div>
                </TableCell>
              )}
              <TableCell>
                <Skeleton className={cn("h-6 rounded-md", pick(["w-28", "w-24", "w-32", "w-28", "w-20"], i))} />
              </TableCell>
              <TableCell>
                <Skeleton className={cn("ml-auto h-4", pick(["w-16", "w-14", "w-20"], i))} />
              </TableCell>
              {showBalance && (
                <TableCell className="hidden md:table-cell">
                  <Skeleton className="ml-auto h-4 w-16" />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
