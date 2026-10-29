import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { categories, transactions, tx } from "@/stories/fixtures";
import { TransactionTable } from "./transaction-table";

const meta = {
  title: "Transactions/TransactionTable",
  component: TransactionTable,
  args: { rows: transactions, categories, showAccount: true, showBalance: true },
} satisfies Meta<typeof TransactionTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Click a row to open the detail dialog; server actions are mocked and logged in the Actions panel. */
export const Default: Story = {};

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
    ],
  },
};
