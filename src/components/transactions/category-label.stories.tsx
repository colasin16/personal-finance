import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { categories } from "@/stories/fixtures";
import { CategoryLabel } from "./category-label";

const meta = {
  title: "Transactions/CategoryLabel",
  component: CategoryLabel,
  args: { name: "Groceries", icon: "shopping-cart", color: "#16a34a" },
} satisfies Meta<typeof CategoryLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongNameInNarrowSpace: Story = {
  args: { name: "Subscriptions and recurring digital services" },
  decorators: [(Story) => <div className="w-40">{Story()}</div>],
};

export const AllCategories: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {categories.map((c) => (
        <CategoryLabel key={c.id} name={c.name} icon={c.icon} color={c.color} />
      ))}
    </div>
  ),
};
