import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCategories, getVisibleAccounts, listTransactions, PAGE_SIZE } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { toTxItem } from "@/components/transactions/tx-item";
import { TransactionFilters } from "./filters";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("transactions");
  return { title: t("title") };
}

type Search = { q?: string; account?: string; category?: string; from?: string; to?: string; flagged?: string; page?: string; statement?: string };

const dateParam = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const uuidParam = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined);

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { db, user, household } = await requireContext();
  const [locale, t, tc] = await Promise.all([getLocale(), getTranslations("transactions"), getTranslations("common")]);
  const [accounts, cats] = await Promise.all([
    getVisibleAccounts(db, household.id, user.id, { includeArchived: true }),
    getCategories(db, household.id, locale),
  ]);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const filters = {
    q: params.q?.slice(0, 100) || undefined,
    accountId: uuidParam(params.account),
    categoryId: params.category === "none" ? "none" : uuidParam(params.category),
    from: dateParam(params.from),
    to: dateParam(params.to),
    flagged: params.flagged === "1",
    statementId: uuidParam(params.statement),
    page,
  };
  const { rows, total, sumCents } = await listTransactions(db, household.id, accounts.map((a) => a.id), filters);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    sp.set("page", String(p));
    return `/transactions?${sp}`;
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <TransactionFilters
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={cats.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }))}
      />
      <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {t.rich("summary", {
            count: total,
            money: () => <Money cents={sumCents} signed className="font-medium text-foreground" />,
          })}
        </span>
      </div>
      <TransactionTable
        key={JSON.stringify(filters)}
        rows={rows.map(toTxItem)}
        categories={cats.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }))}
      />
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">{tc("pageOf", { page, total: pages })}</span>
          <Button asChild variant="outline" size="icon" disabled={page <= 1} aria-label={t("previousPage")}>
            <Link href={pageHref(Math.max(1, page - 1))} aria-disabled={page <= 1}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label={t("nextPage")}>
            <Link href={pageHref(Math.min(pages, page + 1))} aria-disabled={page >= pages}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}
