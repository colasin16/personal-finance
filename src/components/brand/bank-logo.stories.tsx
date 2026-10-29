import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BANKS } from "@/lib/db/seed";
import { BankLogo } from "./bank-logo";

const meta = {
  title: "Brand/BankLogo",
  component: BankLogo,
  args: { bankId: "ing", name: "ING", color: "#ff6200", size: 32 },
} satisfies Meta<typeof BankLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllBanks: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-3">
      {BANKS.map((bank) => (
        <div key={bank.id} className="flex items-center gap-2 text-sm">
          <BankLogo bankId={bank.id} name={bank.name} color={bank.color} size={args.size} />
          {bank.name}
        </div>
      ))}
    </div>
  ),
};
