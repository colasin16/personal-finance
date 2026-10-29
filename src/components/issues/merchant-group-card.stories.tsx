import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { categories } from "@/stories/fixtures";
import { MerchantGroupCard, type UncategorizedRow } from "./merchant-group-card";

const rows = (merchant: string, amounts: number[], reason: string | null = "low_confidence"): UncategorizedRow[] =>
  amounts.map((amountCents, i) => ({
    id: `${merchant}-${i}`,
    bookedAt: `2026-09-${String(28 - i * 3).padStart(2, "0")}`,
    amountCents,
    accountName: i % 2 ? "Cuenta Común" : "Cuenta Nómina",
    reason,
    description: `COMPRA TARJETA ${merchant.toUpperCase()} MADRID`,
  }));

const card = (merchant: string, amounts: number[], reason?: string | null) => ({
  merchant,
  dismissKey: `merchant:${merchant}`,
  totalCents: amounts.reduce((sum, a) => sum + a, 0),
  rows: rows(merchant, amounts, reason),
});

const meta = {
  title: "Issues/MerchantGroupCard",
  component: MerchantGroupCard,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
  args: { ...card("Bodega El Rincon", [-2_850, -3_120]), categories },
} satisfies Meta<typeof MerchantGroupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Choosing a category or dismissing calls the mocked server actions (see the Actions panel). */
export const Default: Story = {};

/** More than three transactions collapse behind a "Show more" toggle. */
export const ManyTransactions: Story = { args: card("Bodega El Rincon", [-2_850, -3_120, -1_990, -4_200, -2_500]) };

export const Income: Story = { args: card("Bizum", [1_500], "uncategorized") };

/** Without a flag reason the card falls back to the "Low confidence" label. */
export const NoReason: Story = { args: card("Farmacia Lda. Gómez", [-1_245], null) };

export const LongMerchantName: Story = {
  args: card("Transferencia recibida de un ordenante con un nombre extraordinariamente largo S.L.", [-12_000, -8_000]),
};
