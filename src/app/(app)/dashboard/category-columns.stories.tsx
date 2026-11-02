import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { plainCategorySlices, reimbursedCategorySlices } from "@/stories/fixtures";
import { CategoryColumnsCard } from "./category-columns";

const meta = {
  title: "Dashboard/CategoryColumnsCard",
  component: CategoryColumnsCard,
  args: { items: reimbursedCategorySlices },
} satisfies Meta<typeof CategoryColumnsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Net spending per category; reimbursements are stacked on top as a green hatched segment. */
export const WithReimbursements: Story = {};

export const NoReimbursements: Story = { args: { items: plainCategorySlices } };

export const Empty: Story = { args: { items: [] } };
