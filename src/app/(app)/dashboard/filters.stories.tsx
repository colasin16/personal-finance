import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { DashboardFilters } from "./filters";

const phone = { viewport: { value: "mobile2" } };
const nav = (query: Record<string, string> = {}) => ({ nextjs: { navigation: { pathname: "/dashboard", query } } });

const meta = {
  title: "Dashboard/DashboardFilters",
  component: DashboardFilters,
  args: {
    scopes: [
      { value: "household", label: "Household" },
      { value: "shared", label: "Shared" },
      { value: "member:alex", label: "Alex (you)" },
      { value: "member:sam", label: "Sam" },
    ],
    months: ["2026-09", "2026-08", "2026-07", "2026-06", "2026-05"],
    range: { start: "2026-05-01", end: "2026-09-28" },
    average: { months: 5, available: true, active: false },
  },
  parameters: nav(),
} satisfies Meta<typeof DashboardFilters>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Wide screens: scope, period and total/average inline next to the title. Selections update the URL, which the mocked
 * router doesn't feed back, so only the period pill reflects clicks here.
 */
export const Desktop: Story = {};

/** Below `xl`: scope tabs share the title row; period and "Show as" get their own row. */
export const Tablet: Story = { globals: { viewport: { value: "tablet" } } };

/** A specific month adds stepper arrows around the "Custom" pill. */
export const MonthPicked: Story = {
  args: { range: { start: "2026-08-01", end: "2026-08-31" }, average: { months: 1, available: false, active: false } },
  parameters: nav({ period: "2026-08" }),
};

/** Phones keep only the period inline; scope and total/average sit behind the button next to the title. */
export const Phone: Story = { globals: phone };

/** The button shows the current scope, plus the ÷N divisor while monthly averages are on. */
export const PhoneAverage: Story = {
  globals: phone,
  args: { average: { months: 5, available: true, active: true } },
  parameters: nav({ scope: "shared", view: "avg" }),
};

/** The period strip scrolls sideways instead of wrapping, keeping the picked month in view. */
export const PhoneMonthPicked: Story = { ...MonthPicked, globals: phone };

/** The "View options" bottom sheet; explains inline why averages are off since tooltips don't work on touch. */
export const PhoneOptionsOpen: Story = {
  globals: phone,
  args: { average: { months: 1, available: false, active: false } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /View options|Opciones de vista/ }));
  },
};
