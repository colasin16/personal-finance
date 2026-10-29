import { useTranslations } from "next-intl";
import { BankLogo } from "@/components/brand/bank-logo";
import { cn } from "@/lib/utils";

export type AccountRefData = {
  name: string;
  bankId: string;
  bankName: string;
  bankColor: string;
  ibanLast4: string | null;
};

/** Picks the AccountRef fields from any account-shaped object (e.g. a VisibleAccount). */
export const toAccountRef = ({ name, bankId, bankName, bankColor, ibanLast4 }: AccountRefData): AccountRefData => ({
  name,
  bankId,
  bankName,
  bankColor,
  ibanLast4,
});

const SIZES = {
  sm: { logo: 14, text: "text-xs", gap: "gap-1.5", logoClass: "rounded-[2px]" },
  md: { logo: 18, text: "text-sm", gap: "gap-2", logoClass: "rounded-[3px]" },
} as const;

/**
 * Compact reference to a bank account (bank logo · name · IBAN last 4) for tables, dialogs and inline text,
 * so accounts with similar names stay distinguishable. Not the full account card from the Accounts page.
 * Inherits text colour from its parent; the name truncates when space is tight while the IBAN suffix stays visible.
 */
export function AccountRef({
  account,
  size = "sm",
  className,
}: {
  account: AccountRefData;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const tc = useTranslations("common");
  const s = SIZES[size];
  const label = [account.bankName, account.name, account.ibanLast4]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      title={label}
      className={cn(
        "inline-flex max-w-full min-w-0 items-center align-middle",
        s.gap,
        s.text,
        className,
      )}
    >
      <BankLogo
        bankId={account.bankId}
        name={account.bankName}
        color={account.bankColor}
        size={s.logo}
        bare
        className={s.logoClass}
      />
      <span className="truncate">{account.name}</span>
      {account.ibanLast4 && (
        <>
          <span
            aria-hidden
            className="shrink-0 font-mono tabular-nums opacity-70"
          >
            *{account.ibanLast4}
          </span>
          <span className="sr-only">{`, ${tc("ibanEndingIn", { last4: account.ibanLast4 })}`}</span>
        </>
      )}
    </span>
  );
}
