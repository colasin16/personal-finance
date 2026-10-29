import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { categories } from "@/stories/fixtures";
import { RulesManager, type RuleRow } from "./rules-manager";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

const rules: RuleRow[] = [
  { id: "r1", matchType: "merchant", pattern: "Mercadona", categoryId: "cat-groceries", enabled: true, hits: 42, lastMatchedAt: daysAgo(2) },
  { id: "r2", matchType: "contains", pattern: "NOMINA", categoryId: "cat-salary", enabled: true, hits: 12, lastMatchedAt: daysAgo(20) },
  { id: "r3", matchType: "regex", pattern: "RENFE|CABIFY|UBER", categoryId: "cat-transport", enabled: false, hits: 7, lastMatchedAt: daysAgo(90) },
  { id: "r4", matchType: "contains", pattern: "TRASPASO A CUENTA AHORRO", categoryId: "cat-transfers", enabled: true, hits: 0, lastMatchedAt: null },
  {
    id: "r5",
    matchType: "contains",
    pattern: "RESTAURANTE CON UN NOMBRE MUY LARGO QUE NO CABE EN LA FILA",
    categoryId: "cat-restaurants",
    enabled: true,
    hits: 3,
    lastMatchedAt: daysAgo(5),
  },
];

const meta = {
  title: "Settings/RulesManager",
  component: RulesManager,
  args: { rules, categories },
} satisfies Meta<typeof RulesManager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = { args: { rules: [] } };

export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
