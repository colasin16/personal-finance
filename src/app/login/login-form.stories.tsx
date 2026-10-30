import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { LoginForm } from "./login-form";

const meta = {
  title: "Auth/LoginForm",
  component: LoginForm,
  args: { mode: "supabase", demoEnabled: false },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Supabase: Story = {};

/** After the email is sent: enter the code (the mock accepts 123456). */
export const CheckEmail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(/email/i), "alex@example.com");
    await userEvent.click(canvas.getByRole("button", { name: /continue/i }));
    await expect(await canvas.findByLabelText(/code/i)).toBeInTheDocument();
  },
};

export const ExpiredLink: Story = { args: { linkError: true } };

export const OfflineWithDemo: Story = { args: { mode: "mock", demoEnabled: true } };
