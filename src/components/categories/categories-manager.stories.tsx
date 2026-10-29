import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { categories as options } from "@/stories/fixtures";
import { CategoriesManager, type ManagedCategory } from "./categories-manager";

const categories: ManagedCategory[] = options.map((c, i) => ({
  ...c,
  system: c.id === "cat-transfers",
  transactions: [42, 18, 7, 0, 12, 30][i] ?? 0,
  rules: [2, 1, 0, 0, 1, 0][i] ?? 0,
}));

const meta = {
  title: "Settings/CategoriesManager",
  component: CategoriesManager,
  args: { categories },
} satisfies Meta<typeof CategoriesManager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
