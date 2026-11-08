import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NetWorthCard } from "./charts";

const series = (values: number[]) => values.map((value, i) => ({ time: `2026-0${i + 5}-01`, value }));

const meta = {
  title: "Dashboard/NetWorthCard",
  component: NetWorthCard,
  args: { accounts: [], netWorth: series([1_820_000, 1_865_000, 1_840_000, 1_910_000, 1_969_122]) },
} satisfies Meta<typeof NetWorthCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ends the period above where it started: green area. */
export const Growing: Story = {};

/** Ends the period below where it started, even with a bump in between: red area. */
export const Declining: Story = { args: { netWorth: series([1_969_122, 1_990_000, 1_910_000, 1_865_000, 1_896_051]) } };
