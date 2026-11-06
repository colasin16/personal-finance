import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { categories, transactions, tx } from "@/stories/fixtures";
import { TransactionCard, TransactionCardList } from "./transaction-card";

const mobile = { viewport: { value: "mobile2" } };

const meta = {
  title: "Transactions/TransactionCardList",
  component: TransactionCardList,
  args: { rows: transactions, categories, showAccount: true, showBalance: true },
  globals: mobile,
} satisfies Meta<typeof TransactionCardList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mobile alternative to TransactionTable. Tap the eye to open the detail dialog; server actions are mocked. */
export const Default: Story = {};

export const SmallPhone: Story = { globals: { viewport: { value: "mobile1" } } };

export const Empty: Story = { args: { rows: [], emptyMessage: "No transactions match these filters" } };

export const RemovedTransactions: Story = {
  args: { rows: transactions.slice(0, 2).map((t) => ({ ...t, excluded: true })) },
};

export const LongDescriptions: Story = {
  args: {
    rows: [
      tx({
        id: "long-1",
        merchant: null,
        descriptionRaw: "TRANSFERENCIA SEPA RECIBIDA DE UN ORDENANTE CON UN NOMBRE MUY LARGO S.L. CONCEPTO FACTURA 2026/0001234 REF 99887766",
      }),
      tx({
        id: "long-2",
        merchant: "Supermercados Muy Largos Del Norte Peninsular S.A.",
        descriptionRaw: "COMPRA TARJETA 4B*1234 SUPERMERCADOS MUY LARGOS DEL NORTE PENINSULAR S.A. OVIEDO ES",
      }),
    ],
  },
};

/** Scroll down: the next batch loads automatically (mocked, three batches); the button is the fallback. */
export const InfiniteScroll: Story = {
  args: {
    loadMore: { filters: { pageSize: 25 }, cursor: "batch:1", remaining: transactions.length * 3 },
  },
};

/** A single card on its own, with its callbacks logged in the Actions panel. */
export const SingleCard: StoryObj<typeof TransactionCard> = {
  render: (args) => <TransactionCard {...args} />,
  args: {
    tx: transactions[0],
    categories,
    selected: false,
    showBalance: true,
    onSelectedChange: fn(),
    onCategoryChange: fn(),
    onView: fn(),
  },
};
