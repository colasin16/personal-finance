import { addDays, isoDate, matchBankId, type ProviderTransaction } from "@/lib/domain/bank-sync";
import { compactIban } from "@/lib/domain/redact";
import { sha256 } from "@/lib/domain/text";
import { BANKS } from "@/lib/db/seed";
import { SAMPLE_ACCOUNTS } from "@/lib/dev/sample-statements";
import { BankSyncError, type BankSyncProvider, type ProviderAccount } from "./types";

/** Path of the fake consent screen (served by the app) the mock sends users to instead of a bank. */
export const MOCK_CONSENT_PATH = "/settings/bank-connections/mock-consent";

const MERCHANTS: { name: string; text: string; min: number; max: number }[] = [
  { name: "MERCADONA", text: "COMPRA TARJ. MERCADONA", min: 1_500, max: 9_000 },
  { name: "LIDL SUPERMERCADOS", text: "COMPRA TARJ. LIDL SUPERMERCADOS", min: 800, max: 4_500 },
  { name: "RESTAURANTE LA TAGLIATELLA", text: "COMPRA TARJ. RESTAURANTE LA TAGLIATELLA", min: 1_800, max: 6_500 },
  { name: "CABIFY", text: "COMPRA TARJ. CABIFY MADRID", min: 700, max: 2_400 },
  { name: "STARBUCKS COFFEE", text: "PAGO TARJETA STARBUCKS COFFEE", min: 450, max: 980 },
  { name: "AMAZON EU SARL", text: "COMPRA TARJ. AMAZON EU SARL", min: 1_200, max: 8_000 },
  { name: "REPSOL", text: "COMPRA TARJ. REPSOL ESTACION", min: 4_000, max: 7_000 },
  { name: "FARMACIA CENTRO", text: "PAGO TARJETA FARMACIA CENTRO", min: 500, max: 2_500 },
];

/** Deterministic [0, 1) numbers from a seed string. */
function randoms(seed: string) {
  let i = 0;
  return () => parseInt(sha256(`${seed}|${i++}`).slice(0, 8), 16) / 0x1_0000_0000;
}

const bankIdOf = (name: string) => matchBankId(name, BANKS);

function accountsFor(bankName: string): ProviderAccount[] {
  const bankId = bankIdOf(bankName);
  const samples = SAMPLE_ACCOUNTS.filter((a) => a.bank === bankId);
  const list = samples.length
    ? samples.map((a) => ({ iban: compactIban(a.iban), name: a.name }))
    : [{ iban: `ES00${sha256(bankName).replace(/\D/g, "").padEnd(20, "0").slice(0, 20)}`, name: `Cuenta ${bankName}` }];
  return list.map((a) => ({ uid: `mock-acc|${a.iban}`, iban: a.iban, name: a.name, currency: "EUR", cashAccountType: "CACC" }));
}

function parseSession(sessionId: string) {
  const [prefix, bank, until] = sessionId.split("|");
  if (prefix !== "mock" || !bank || !until) throw new BankSyncError("expired", "Unknown mock session");
  return { bank, validUntil: new Date(Number(until)) };
}

function dayTransactions(uid: string, date: string, status: "BOOK" | "PDNG"): ProviderTransaction[] {
  const rand = randoms(`${uid}|${date}`);
  const day = Number(date.slice(8, 10));
  const out: ProviderTransaction[] = [];
  const add = (amountCents: number, text: string, counterparty: string) =>
    out.push({
      entry_reference: `${uid.slice(-8)}-${date.replaceAll("-", "")}-${out.length}`,
      transaction_amount: { currency: "EUR", amount: (Math.abs(amountCents) / 100).toFixed(2) },
      credit_debit_indicator: amountCents < 0 ? "DBIT" : "CRDT",
      status,
      booking_date: date,
      value_date: date,
      ...(amountCents < 0 ? { creditor: { name: counterparty } } : { debtor: { name: counterparty } }),
      remittance_information: [text],
    });
  if (day === 28) add(240_000, "NOMINA ACME SOFTWARE SL", "ACME SOFTWARE SL");
  if (day === 3) add(-4_599, "RECIBO VODAFONE ESPANA SAU", "VODAFONE ESPANA SAU");
  const count = Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const m = MERCHANTS[Math.floor(rand() * MERCHANTS.length)]!;
    add(-Math.round(m.min + rand() * (m.max - m.min)), m.text, m.name);
  }
  return out;
}

/** Offline stand-in for Enable Banking: a fake consent page and deterministic daily transactions. */
export class MockBankProvider implements BankSyncProvider {
  readonly id = "mock" as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async listBanks(country: string) {
    return BANKS.filter((b) => b.id !== "other" && (country === "ES" || b.country === country)).map((b) => ({
      name: b.name,
      country,
      logo: null,
      maxConsentSeconds: b.id === "bbva" ? 90 * 86_400 : 180 * 86_400,
      beta: false,
    }));
  }

  async startAuth(input: Parameters<BankSyncProvider["startAuth"]>[0]) {
    const url = new URL(MOCK_CONSENT_PATH, input.redirectUrl);
    url.search = new URLSearchParams({
      bank: input.bank.name,
      state: input.state,
      grant: `mock|${input.bank.name}|${input.validUntil.getTime()}`,
    }).toString();
    return { url: url.toString() };
  }

  async createSession(code: string) {
    const { bank, validUntil } = parseSession(code);
    return { sessionId: code, validUntil, accounts: accountsFor(bank) };
  }

  async getSession(sessionId: string) {
    const { validUntil } = parseSession(sessionId);
    return { status: validUntil < this.now() ? ("expired" as const) : ("active" as const), validUntil };
  }

  async getBalance(accountUid: string) {
    const rand = randoms(accountUid);
    return { cents: 150_000 + Math.round(rand() * 400_000), date: isoDate(this.now()) };
  }

  async getTransactions(accountUid: string, range: { dateFrom: string; dateTo: string }) {
    const today = isoDate(this.now());
    const out: ProviderTransaction[] = [];
    for (let d = range.dateFrom; d <= range.dateTo && d <= today; d = addDays(d, 1)) {
      out.push(...dayTransactions(accountUid, d, d === today ? "PDNG" : "BOOK"));
    }
    return out;
  }

  async revokeSession() {}
}
