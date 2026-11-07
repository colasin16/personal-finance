import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, mocked, userEvent, within } from "storybook/test";
import { getTransactionHistoryAction } from "@/lib/actions/transactions";
import { categories, transactions, tx } from "@/stories/fixtures";
import { TransactionDetail } from "./transaction-detail";

const byId = (id: string) => transactions.find((t) => t.id === id)!;
const categoryOf = (categoryId: string | null) => categories.find((c) => c.id === categoryId);

const meta = {
  title: "Transactions/TransactionDetail",
  component: TransactionDetail,
  args: {
    tx: byId("tx-1"),
    category: categoryOf("cat-groceries"),
    categories,
    onClose: fn(),
    onCreateRule: fn(),
  },
} satisfies Meta<typeof TransactionDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Categorized by the LLM; server actions are mocked and logged in the Actions panel. */
export const Default: Story = {};

export const AppliedRule: Story = {
  args: { tx: byId("tx-2"), category: categoryOf("cat-restaurants") },
};

export const FlaggedUncategorized: Story = {
  args: { tx: byId("tx-3"), category: undefined },
};

export const LinkedTransfer: Story = {
  args: { tx: byId("tx-4"), category: categoryOf("cat-transfers") },
};

export const WithNotes: Story = {
  args: { tx: byId("tx-5"), category: categoryOf("cat-salary") },
};

export const LongDescription: Story = {
  args: {
    tx: tx({
      merchant: null,
      descriptionRaw:
        "TRANSFERENCIA SEPA RECIBIDA DE UN ORDENANTE CON UN NOMBRE MUY LARGO S.L. CONCEPTO FACTURA 2026/0001234 REF 99887766554433221100",
    }),
  },
};

/** Opens the change history, mocked with category changes (incl. a deleted category) and a note edit. */
export const WithHistory: Story = {
  args: { tx: byId("tx-5"), category: categoryOf("cat-salary") },
  beforeEach: () => {
    mocked(getTransactionHistoryAction).mockResolvedValueOnce([
      {
        id: "change-0",
        transactionId: "tx-5",
        userId: "user-1",
        field: "category",
        oldValue: "cat-deleted",
        newValue: null,
        createdAt: new Date("2026-09-01T18:00:00"),
      },
      {
        id: "change-1",
        transactionId: "tx-5",
        userId: "user-1",
        field: "category",
        oldValue: null,
        newValue: "cat-salary",
        createdAt: new Date("2026-09-02T09:15:00"),
      },
      {
        id: "change-2",
        transactionId: "tx-5",
        userId: "user-1",
        field: "notes",
        oldValue: null,
        newValue: "September payroll",
        createdAt: new Date("2026-09-02T09:16:00"),
      },
    ]);
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole("button", { name: /history/i }));
    await expect(await body.findByText(/September payroll”/)).toBeInTheDocument();
  },
};
