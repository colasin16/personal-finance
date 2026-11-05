import { TrendingDown } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { BankLogo } from "@/components/brand/bank-logo";
import { Money } from "@/components/money";
import { BANKS, DEFAULT_CATEGORIES } from "@/lib/db/seed";
import { localizeCategoryName } from "@/lib/i18n/categories";

// Illustrative numbers only (cents); the two lists add up to the same total.
const BY_BANK = [
  { id: "ing", cents: 81240 },
  { id: "bbva", cents: 60415 },
  { id: "n26", cents: 32390 },
];
const BY_CATEGORY = [
  { slug: "housing", cents: 65000 },
  { slug: "groceries", cents: 41230 },
  { slug: "restaurants", cents: 23685 },
  { slug: "shopping", cents: 20100 },
  { slug: "transport", cents: 14820 },
  { slug: "subscriptions", cents: 9210 },
];
const TOTAL = BY_BANK.reduce((sum, b) => sum + b.cents, 0);

/** Static mock of the dashboard for the landing page: one total, split by bank and by category. */
export async function DashboardPreview() {
  const t = await getTranslations("landing.preview");
  const locale = await getLocale();
  const banks = BY_BANK.map((b) => ({ ...b, ...BANKS.find((bank) => bank.id === b.id)! }));
  const categories = BY_CATEGORY.map((c) => {
    const category = DEFAULT_CATEGORIES.find((d) => d.slug === c.slug)!;
    return { ...c, color: category.color, name: localizeCategoryName(category, locale) };
  });
  const largest = Math.max(...categories.map((c) => c.cents));

  return (
    <figure aria-label={t("label")} className="rounded-2xl border bg-card p-5 text-card-foreground shadow-xl shadow-black/5 sm:p-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {t("spent")} · {t("month")}
            </p>
            <Money cents={TOTAL} className="mt-1 block text-3xl font-semibold tracking-tight" />
          </div>
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <TrendingDown className="size-3.5" />
            {t("change", { percent: 12 })}
          </span>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("byBank")}</p>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {banks.map((b) => (
              <div key={b.id} style={{ width: `${(b.cents / TOTAL) * 100}%`, backgroundColor: b.color }} />
            ))}
          </div>
          <ul className="space-y-2">
            {banks.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-sm">
                <BankLogo bankId={b.id} name={b.name} color={b.color} size={20} />
                <span className="truncate">{b.name}</span>
                <Money cents={b.cents} className="ml-auto text-muted-foreground" />
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("byCategory")}</p>
          <ul className="space-y-2.5">
            {categories.map((c) => (
              <li key={c.slug} className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_4.5rem]">
                <span className="truncate">{c.name}</span>
                <span className="h-2 rounded-full bg-muted">
                  <span className="block h-full rounded-full" style={{ width: `${(c.cents / largest) * 100}%`, backgroundColor: c.color }} />
                </span>
                <Money cents={c.cents} className="text-right text-muted-foreground" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </figure>
  );
}
