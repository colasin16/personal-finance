import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money";
import { useAmountsVisibility } from "@/components/privacy/amounts-visibility";
import { changeTrend, Delta, KpiCard, trend } from "./kpi-card";

type Flows = { income: number; expenses: number };

/** The dashboard's four headline cards, wired like page.tsx: each card is tinted green or red by whether its figure improved. */
function KpiGrid({ current, previous, netWorth, netWorthChange }: { current: Flows; previous?: Flows; netWorth: number; netWorthChange: number }) {
  const t = useTranslations("dashboard");
  const { hidden } = useAmountsVisibility();
  const money = (cents: number, signed = false) => formatMoney(cents, "EUR", { hidden, signed });
  const deltaLabel = (pct: string) => t("kpis.delta", { pct });
  const net = current.income - current.expenses;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label={t("kpis.netWorth")}
        value={money(netWorth)}
        sub={
          <span className={netWorthChange >= 0 ? "text-xs font-medium text-emerald-600" : "text-xs font-medium text-red-600"}>
            {t("kpis.netWorthChange", { amount: money(netWorthChange, true) })}
          </span>
        }
        trend={changeTrend(netWorthChange)}
      />
      <KpiCard
        label={t("kpis.income")}
        value={money(current.income)}
        sub={<Delta current={current.income} previous={previous?.income} label={deltaLabel} />}
        trend={trend(current.income, previous?.income)?.trend}
      />
      <KpiCard
        label={t("kpis.spending")}
        value={money(current.expenses)}
        sub={<Delta current={current.expenses} previous={previous?.expenses} invert label={deltaLabel} />}
        trend={trend(current.expenses, previous?.expenses, true)?.trend}
      />
      <KpiCard
        label={t("kpis.saved")}
        value={money(net)}
        sub={<span className="text-xs text-muted-foreground">{t("kpis.savingsRate", { pct: Math.round((net / current.income) * 100) })}</span>}
        trend={previous && trend(net, previous.income - previous.expenses)?.trend}
      />
    </div>
  );
}

const meta = {
  title: "Dashboard/KpiCards",
  component: KpiGrid,
  args: { netWorth: 1_896_051, netWorthChange: 73_071, current: { income: 549_726, expenses: 307_797 } },
} satisfies Meta<typeof KpiGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Net worth grew, income up, spending down and more saved: every card gets the green tint. */
export const AllImproved: Story = { args: { previous: { income: 495_000, expenses: 342_000 } } };

/** Net worth shrank, income down, spending up and less saved: every card gets the red tint. */
export const AllWorsened: Story = { args: { netWorthChange: -73_071, previous: { income: 611_000, expenses: 274_800 } } };

/** Net worth down (red), income up (green), spending up (red), saved more (green). */
export const Mixed: Story = { args: { netWorthChange: -73_071, previous: { income: 495_000, expenses: 298_800 } } };

/** Changes under 0.5% (and a flat net worth) leave the cards untinted. */
export const Unchanged: Story = { args: { netWorthChange: 0, previous: { income: 549_800, expenses: 307_700 } } };

/** First period with data: no previous period, so only net worth (which moves within the period) is tinted. */
export const NoComparison: Story = {};

export const Phone: Story = { ...Mixed, globals: { viewport: { value: "mobile2" } } };
