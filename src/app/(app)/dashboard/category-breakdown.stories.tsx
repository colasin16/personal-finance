import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { plainCategorySlices, reimbursedCategorySlices } from "@/stories/fixtures";
import { CategoryBreakdown } from "./category-breakdown";

const meta = {
  title: "Dashboard/CategoryBreakdown",
  component: CategoryBreakdown,
  decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
  args: { items: reimbursedCategorySlices },
} satisfies Meta<typeof CategoryBreakdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Reimbursed money (e.g. a friend's share of a dinner) is netted per category and drawn as a hatched segment. */
export const WithReimbursements: Story = {};

/** Without reimbursements there is no hatched segment or legend. */
export const NoReimbursements: Story = { args: { items: plainCategorySlices } };

export const Empty: Story = { args: { items: [] } };
