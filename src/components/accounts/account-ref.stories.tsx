import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BANKS } from "@/lib/db/seed";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/money";
import { AccountRef, type AccountRefData } from "./account-ref";

const account = (bankId: string, name: string, ibanLast4: string | null): AccountRefData => {
  const bank = BANKS.find((b) => b.id === bankId)!;
  return { name, bankId, bankName: bank.name, bankColor: bank.color, ibanLast4 };
};

const ingMain = account("ing", "Cuenta Nómina", "1952");
const ingShared = account("ing", "Cuenta Nómina", "8834");
const bbva = account("bbva", "Cuenta Online", "4321");
const n26 = account("n26", "Ahorro Vacaciones", "0071");
const noIban = account("revolut", "Revolut", null);
const longName = account("santander", "Cuenta conjunta para gastos de la casa y suministros", "5510");

const meta = {
  title: "Accounts/AccountRef",
  component: AccountRef,
  args: { account: ingMain, size: "sm" },
  argTypes: { size: { control: "inline-radio", options: ["sm", "md"] } },
} satisfies Meta<typeof AccountRef>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Medium: Story = { args: { size: "md" } };

export const WithoutIban: Story = { args: { account: noIban } };

/** Name truncates; the IBAN suffix always stays visible. */
export const Truncated: Story = {
  args: { account: longName },
  decorators: [(Story) => <div className="w-56 rounded border p-2">{Story()}</div>],
};

/** Same name at the same bank, told apart by the IBAN suffix. */
export const SameNameAccounts: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <AccountRef {...args} account={ingMain} />
      <AccountRef {...args} account={ingShared} />
    </div>
  ),
};

/** Inside muted inline text, e.g. a transaction line in the issues inbox. */
export const InlineInText: Story = {
  render: (args) => (
    <p className="flex w-96 min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <span className="shrink-0">12 Oct ·</span>
      <AccountRef {...args} account={ingShared} className="min-w-0" />
      <span className="truncate">· MERCADONA VALENCIA 4412</span>
    </p>
  ),
};

export const InTableColumn: Story = {
  render: (args) => (
    <div className="w-[560px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead>Account</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[
            { d: "Mercadona", a: ingMain, c: -4590 },
            { d: "Nómina", a: ingShared, c: 245000 },
            { d: "Amazon", a: bbva, c: -2399 },
            { d: "Transfer to savings", a: n26, c: 30000 },
            { d: "Restaurant", a: longName, c: -6200 },
          ].map((r) => (
            <TableRow key={r.d}>
              <TableCell>{r.d}</TableCell>
              <TableCell className="max-w-48">
                <AccountRef {...args} account={r.a} />
              </TableCell>
              <TableCell className="text-right">
                <Money cents={r.c} signed colored />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
};
