import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, mocked } from "storybook/test";
import { previewRuleAction } from "@/lib/actions/transactions";
import { categories } from "@/stories/fixtures";
import { RuleDialog } from "./rule-dialog";

const meta = {
  title: "Transactions/RuleDialog",
  component: RuleDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    categories,
    initial: { matchType: "merchant", pattern: "MERCADONA", categoryId: "cat-groceries" },
  },
} satisfies Meta<typeof RuleDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Blank: Story = { args: { initial: {} } };

/** Long, unbreakable preview lines used to push the inputs outside the modal. */
export const LongPreviewExamples: Story = {
  beforeEach: () => {
    // Storybook swaps the server action for the mock in .storybook/mocks/actions.
    mocked(previewRuleAction).mockResolvedValueOnce({
      ok: true,
      data: {
        count: 42,
        examples: [
          "COMPRA TARJETA 1234 MERCADONA AVENIDA DE LA CONSTITUCION NUMERO 123 MADRID ESPAÑA REF 0099887766554433",
          "MERCADONA_ONLINE_PEDIDO_000000123456789_ENTREGA_A_DOMICILIO_FRANJA_HORARIA_MAÑANA",
          "MERCADONA",
        ],
      },
    });
  },
};
