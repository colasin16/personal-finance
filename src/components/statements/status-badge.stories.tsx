import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { STATEMENT_STATUS_STYLE } from "@/lib/labels";
import { StatusBadge } from "./status-badge";

const meta = {
  title: "Statements/StatusBadge",
  component: StatusBadge,
  args: { status: "needs_review" },
  argTypes: { status: { control: "select", options: Object.keys(STATEMENT_STATUS_STYLE) } },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Processing: Story = { args: { status: "processing", progress: "extracting" } };

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {Object.keys(STATEMENT_STATUS_STYLE).map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
