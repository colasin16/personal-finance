import type { CategoryOption } from "@/components/transactions/category-picker";
import type { TxItem } from "@/components/transactions/tx-item";

/** Fake data for Storybook stories; nothing here comes from real statements. */
export const categories: CategoryOption[] = [
  { id: "cat-groceries", name: "Groceries", icon: "shopping-cart", color: "#16a34a", kind: "expense" },
  { id: "cat-restaurants", name: "Restaurants", icon: "utensils", color: "#ea580c", kind: "expense" },
  { id: "cat-transport", name: "Transport", icon: "train-front", color: "#2563eb", kind: "expense" },
  { id: "cat-home", name: "Home", icon: "home", color: "#9333ea", kind: "expense" },
  { id: "cat-salary", name: "Salary", icon: "briefcase", color: "#0d9488", kind: "income" },
  { id: "cat-transfers", name: "Transfers", icon: "repeat", color: "#64748b", kind: "transfer" },
];

const base: TxItem = {
  id: "tx-0",
  bookedAt: "2026-09-05",
  descriptionRaw: "COMPRA TARJETA MERCADONA MADRID",
  merchant: "Mercadona",
  amountCents: -4_235,
  currency: "EUR",
  balanceAfterCents: 152_310,
  account: { name: "Cuenta Nómina", bankId: "ing", bankName: "ING", bankColor: "#ff6200", ibanLast4: "1952" },
  categoryId: "cat-groceries",
  categorizedBy: "llm",
  categoryConfidence: 0.92,
  flagged: false,
  flagReason: null,
  transferGroupId: null,
  linked: [],
  notes: null,
  statementId: "statement-1",
  isConfirmed: false,
  excluded: false,
  rule: null,
};

export const tx = (overrides: Partial<TxItem>): TxItem => ({ ...base, ...overrides });

export const transactions: TxItem[] = [
  tx({ id: "tx-1" }),
  tx({
    id: "tx-2",
    bookedAt: "2026-09-04",
    descriptionRaw: "BODEGA EL RINCON",
    merchant: "Bodega El Rincon",
    amountCents: -2_850,
    balanceAfterCents: 156_545,
    categoryId: "cat-restaurants",
    categorizedBy: "rule",
    categoryConfidence: 1,
    rule: { matchType: "merchant", pattern: "BODEGA EL RINCON", categoryId: "cat-restaurants" },
  }),
  tx({
    id: "tx-3",
    bookedAt: "2026-09-03",
    descriptionRaw: "BIZUM RECIBIDO CENA AMIGOS",
    merchant: null,
    amountCents: 1_500,
    balanceAfterCents: 159_395,
    categoryId: null,
    categorizedBy: null,
    categoryConfidence: null,
    flagged: true,
    flagReason: "uncategorized",
  }),
  tx({
    id: "tx-4",
    bookedAt: "2026-09-02",
    descriptionRaw: "TRANSFERENCIA A CUENTA COMUN",
    merchant: null,
    amountCents: -50_000,
    balanceAfterCents: 157_895,
    categoryId: "cat-transfers",
    categorizedBy: "transfer",
    categoryConfidence: 1,
    transferGroupId: "transfer-1",
    linked: [
      {
        hidden: false,
        id: "tx-shared-1",
        accountId: "account-shared",
        account: { name: "Cuenta Común", bankId: "bbva", bankName: "BBVA", bankColor: "#004481", ibanLast4: "7890" },
        bookedAt: "2026-09-02",
        description: "TRANSFERENCIA DE ALEX",
        amountCents: 50_000,
        currency: "EUR",
        removed: false,
      },
    ],
  }),
  tx({
    id: "tx-5",
    bookedAt: "2026-09-01",
    descriptionRaw: "NOMINA ACME SL",
    merchant: "Acme SL",
    amountCents: 245_000,
    balanceAfterCents: 207_895,
    categoryId: "cat-salary",
    categorizedBy: "user",
    categoryConfidence: 1,
    isConfirmed: true,
    notes: "September payroll",
  }),
];
