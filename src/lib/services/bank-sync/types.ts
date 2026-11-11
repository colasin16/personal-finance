import type { ProviderTransaction } from "@/lib/domain/bank-sync";

export type ProviderBank = { name: string; country: string; logo: string | null; maxConsentSeconds: number | null; beta: boolean };

export type ProviderAccount = {
  uid: string;
  iban: string | null;
  name: string;
  currency: string;
  cashAccountType: string | null;
};

export type ProviderSessionStatus = "active" | "expired" | "revoked" | "pending";

/** Why a provider call failed; `expired` means the user must reconnect, the rest are retried on the next run. */
export class BankSyncError extends Error {
  constructor(
    readonly kind: "expired" | "rate_limited" | "unavailable" | "denied" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "BankSyncError";
  }
}

/** Read-only open banking (PSD2 AIS). See OPEN_BANKING.md. */
export interface BankSyncProvider {
  readonly id: "enable-banking" | "mock";
  listBanks(country: string): Promise<ProviderBank[]>;
  startAuth(input: { bank: { name: string; country: string }; redirectUrl: string; state: string; validUntil: Date; language?: string }): Promise<{ url: string }>;
  createSession(code: string): Promise<{ sessionId: string; validUntil: Date | null; accounts: ProviderAccount[] }>;
  getSession(sessionId: string): Promise<{ status: ProviderSessionStatus; validUntil: Date | null }>;
  getBalance(accountUid: string): Promise<{ cents: number; date: string | null } | null>;
  /** Every booked and pending transaction between the dates (inclusive), following pagination. */
  getTransactions(accountUid: string, range: { dateFrom: string; dateTo: string }): Promise<ProviderTransaction[]>;
  revokeSession(sessionId: string): Promise<void>;
}
