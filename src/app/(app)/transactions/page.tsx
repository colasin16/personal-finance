import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { encodeTransactionCursor, getCategories, getVisibleAccounts, listTransactions } from "@/lib/queries";
import { parsePageSize } from "@/lib/pagination";
import { requireContext } from "@/lib/server/auth";
import { toAccountRef } from "@/components/accounts/account-ref";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { FiltersDialogProvider } from "@/components/transactions/filters-dialog-context";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { toTxItem } from "@/components/transactions/tx-item";
import { TransactionFilters } from "./filters";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("transactions");
  return { title: t("title") };
}

type Search = { q?: string; account?: string; category?: string; from?: string; to?: string; flagged?: string; page?: string; size?: string; statement?: string };

const dateParam = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const uuidParam = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined);

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { db, user, household } = await requireContext();
  const [locale, t] = await Promise.all([getLocale(), getTranslations("transactions")]);
  const [accounts, cats] = await Promise.all([
    getVisibleAccounts(db, household.id, user.id, { includeArchived: true }),
    getCategories(db, household.id, locale),
  ]);
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = parsePageSize(params.size);
  const filters = {
    q: params.q?.slice(0, 100) || undefined,
    accountId: uuidParam(params.account),
    categoryId: params.category === "none" ? "none" : uuidParam(params.category),
    from: dateParam(params.from),
    to: dateParam(params.to),
    flagged: params.flagged === "1",
    statementId: uuidParam(params.statement),
  };
  const visibleIds = accounts.map((a) => a.id);
  let page = requestedPage;
  let { rows, total, sumCents } = await listTransactions(db, household.id, visibleIds, { ...filters, page, pageSize });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  // A page past the end (e.g. after a bigger page size or fewer results) shows the last page instead of nothing.
  if (page > pages) {
    page = pages;
    ({ rows, total, sumCents } = await listTransactions(db, household.id, visibleIds, { ...filters, page, pageSize }));
  }

  const shown = (page - 1) * pageSize + rows.length;
  const last = rows.at(-1);
  const loadMore = {
    filters: { ...filters, pageSize },
    cursor: shown < total && last ? encodeTransactionCursor(last.tx) : null,
    remaining: Math.max(0, total - shown),
  };
  const newest = new URLSearchParams(Object.entries(params).filter(([k, v]) => k !== "page" && typeof v === "string") as [string, string][]);

  return (
    <FiltersDialogProvider>
      <PageHeader title={t("title")} description={t("description")} />
      <TransactionFilters
        accounts={accounts.map((a) => ({ id: a.id, ...toAccountRef(a) }))}
        categories={cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, kind: c.kind }))}
        total={total}
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span>
          {t.rich("summary", {
            count: total,
            money: () => <Money cents={sumCents} signed className="font-medium text-foreground" />,
          })}
        </span>
        <Pagination page={page} pages={pages} pageSize={pageSize} total={total} showRange={false} className="ml-auto hidden md:flex" />
        {page > 1 && (
          <Link href={`/transactions?${newest}`} className="font-medium text-foreground underline underline-offset-4 md:hidden">
            {t("table.backToNewest")}
          </Link>
        )}
      </div>
      <TransactionTable
        key={JSON.stringify({ ...filters, page, pageSize })}
        rows={rows.map(toTxItem)}
        categories={cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, kind: c.kind }))}
        loadMore={loadMore}
      />
      <Pagination page={page} pages={pages} pageSize={pageSize} total={total} className="mt-4 hidden md:flex" />
    </FiltersDialogProvider>
  );
}
