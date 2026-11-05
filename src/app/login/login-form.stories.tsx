import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Card } from "@/components/ui/card";
import { LoginForm } from "./login-form";

const meta = {
  title: "Auth/LoginForm",
  component: LoginForm,
  args: { mode: "supabase", demoEnabled: false },
  decorators: [(Story) => <Card className="max-w-sm">{Story()}</Card>],
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Supabase: Story = {};

/** A known email goes straight to the code (the mock accepts 12345678). */
export const ReturningUser: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(/email/i), "alex@example.com");
    await userEvent.click(canvas.getByRole("button", { name: /continue/i }));
    await expect(await canvas.findByText(/welcome back/i)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /send a new code in/i })).toBeDisabled();
  },
};

/** An unknown email is asked for a name, then confirms the address with the code. */
export const NewUser: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(/email/i), "new@example.com");
    await userEvent.click(canvas.getByRole("button", { name: /continue/i }));
    await userEvent.type(await canvas.findByLabelText(/your name/i), "Alex");
    await userEvent.click(canvas.getByRole("button", { name: /create account/i }));
    await expect(await canvas.findByText(/confirm your email/i)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /confirm and continue/i })).toBeDisabled();
  },
};

export const ExpiredLink: Story = { args: { linkError: true } };

export const OfflineWithDemo: Story = { args: { mode: "mock", demoEnabled: true } };
