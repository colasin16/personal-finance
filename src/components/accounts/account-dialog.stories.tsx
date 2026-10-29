import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { BANKS } from "@/lib/db/seed";
import { AccountDialog } from "./account-dialog";

const meta = {
  title: "Accounts/AccountDialog",
  component: AccountDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    onSaved: fn(),
    banks: BANKS.map(({ id, name, color, country }) => ({ id, name, color, country })),
    members: [
      { id: "user-alex", displayName: "Alex" },
      { id: "user-sam", displayName: "Sam" },
    ],
    currentUserId: "user-alex",
  },
} satisfies Meta<typeof AccountDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {};

export const Editing: Story = {
  args: {
    initial: {
      id: "account-1",
      bankId: "n26",
      name: "Ahorro Vacaciones",
      ibanLast4: "1952",
      type: "savings",
      isPrivate: false,
      owners: [
        { userId: "user-alex", sharePct: 50 },
        { userId: "user-sam", sharePct: 50 },
      ],
    },
  },
};

export const FromUnknownStatement: Story = {
  args: { hint: "We couldn't match this statement to an account. Create it to continue.", initial: { bankId: "bbva", ibanLast4: "4321" } },
};
