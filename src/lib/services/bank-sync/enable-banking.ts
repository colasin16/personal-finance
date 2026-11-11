import { createSign } from "node:crypto";
import { decimalToCents, type ProviderTransaction } from "@/lib/domain/bank-sync";
import { BankSyncError, type BankSyncProvider, type ProviderAccount, type ProviderSessionStatus } from "./types";

const BASE_URL = "https://api.enablebanking.com";
const JWT_TTL_SECONDS = 3600;
const MAX_PAGES = 50;

export type EnableBankingConfig = { appId: string; privateKey: string; baseUrl?: string; fetch?: typeof fetch };

export function enableBankingConfig(): EnableBankingConfig | null {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const privateKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  // Env vars often carry the PEM with literal "\n".
  return appId && privateKey ? { appId, privateKey: privateKey.replace(/\\n/g, "\n") } : null;
}

const b64url = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");

/** The RS256 JWT Enable Banking expects on every request (`kid` = application id). */
export function enableBankingJwt(config: Pick<EnableBankingConfig, "appId" | "privateKey">, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const unsigned = `${b64url({ typ: "JWT", alg: "RS256", kid: config.appId })}.${b64url({
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat,
    exp: iat + JWT_TTL_SECONDS,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(config.privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
}

type EbAccount = {
  uid: string;
  account_id?: { iban?: string | null } | null;
  name?: string | null;
  details?: string | null;
  product?: string | null;
  currency?: string | null;
  cash_account_type?: string | null;
};

const SESSION_STATUS: Record<string, ProviderSessionStatus> = {
  AUTHORIZED: "active",
  RETURNED_FROM_BANK: "pending",
  PENDING_AUTHORIZATION: "pending",
  EXPIRED: "expired",
  CLOSED: "revoked",
  CANCELLED: "revoked",
  REVOKED: "revoked",
  INVALID: "expired",
};

/** Preferred balance types: closing booked, interim available, then anything. */
const BALANCE_ORDER = ["CLBD", "ITBD", "ITAV", "CLAV", "XPCD", "OTHR"];

export class EnableBankingProvider implements BankSyncProvider {
  readonly id = "enable-banking" as const;
  private token: { value: string; until: number } | null = null;

  constructor(private readonly config: EnableBankingConfig) {}

  private jwt() {
    const now = Date.now();
    if (!this.token || this.token.until < now + 60_000) {
      this.token = { value: enableBankingJwt(this.config, now), until: now + JWT_TTL_SECONDS * 1000 };
    }
    return this.token.value;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await (this.config.fetch ?? fetch)(`${this.config.baseUrl ?? BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.jwt()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
    const error = (await res.json().catch(() => ({}))) as { message?: string; error?: string; code?: number };
    const message = `Enable Banking ${method} ${path.split("?")[0]} → ${res.status} ${error.error ?? ""} ${error.message ?? ""}`.trim();
    if (res.status === 429) throw new BankSyncError("rate_limited", message);
    if (res.status === 401 || res.status === 403) {
      // An expired or closed session answers 401/403 with an error naming it; app auth problems are not expiry.
      const text = `${error.error ?? ""} ${error.message ?? ""}`.toUpperCase();
      throw new BankSyncError(/SESSION|EXPIRED|CONSENT|ACCESS/.test(text) ? "expired" : "denied", message);
    }
    if (res.status === 404 && path.startsWith("/sessions/")) throw new BankSyncError("expired", message);
    if (res.status >= 500) throw new BankSyncError("unavailable", message);
    throw new BankSyncError("invalid", message);
  }

  async listBanks(country: string) {
    const data = await this.request<{
      aspsps: { name: string; country: string; logo?: string | null; maximum_consent_validity?: number | null; beta?: boolean; psu_types?: string[] }[];
    }>("GET", `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal&service=AIS`);
    return data.aspsps.map((a) => ({
      name: a.name,
      country: a.country,
      logo: a.logo ?? null,
      maxConsentSeconds: a.maximum_consent_validity ?? null,
      beta: !!a.beta,
    }));
  }

  async startAuth(input: Parameters<BankSyncProvider["startAuth"]>[0]) {
    const data = await this.request<{ url: string }>("POST", "/auth", {
      access: { valid_until: input.validUntil.toISOString() },
      aspsp: input.bank,
      state: input.state,
      redirect_url: input.redirectUrl,
      psu_type: "personal",
      ...(input.language ? { language: input.language } : {}),
    });
    return { url: data.url };
  }

  async createSession(code: string) {
    const data = await this.request<{ session_id: string; accounts: EbAccount[]; access?: { valid_until?: string } }>("POST", "/sessions", { code });
    return {
      sessionId: data.session_id,
      validUntil: data.access?.valid_until ? new Date(data.access.valid_until) : null,
      accounts: data.accounts.map(toAccount),
    };
  }

  async getSession(sessionId: string) {
    const data = await this.request<{ status: string; access?: { valid_until?: string } }>("GET", `/sessions/${encodeURIComponent(sessionId)}`);
    return { status: SESSION_STATUS[data.status] ?? "pending", validUntil: data.access?.valid_until ? new Date(data.access.valid_until) : null };
  }

  async getBalance(accountUid: string) {
    const data = await this.request<{ balances: { balance_amount: { amount: string }; balance_type: string; reference_date?: string | null }[] }>(
      "GET",
      `/accounts/${encodeURIComponent(accountUid)}/balances`,
    );
    const rank = (t: string) => (BALANCE_ORDER.indexOf(t) + BALANCE_ORDER.length + 1) % (BALANCE_ORDER.length + 1);
    const best = [...data.balances].sort((a, b) => rank(a.balance_type) - rank(b.balance_type))[0];
    return best ? { cents: decimalToCents(best.balance_amount.amount), date: best.reference_date ?? null } : null;
  }

  async getTransactions(accountUid: string, range: { dateFrom: string; dateTo: string }) {
    const all: ProviderTransaction[] = [];
    let continuation: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ date_from: range.dateFrom, date_to: range.dateTo });
      if (continuation) params.set("continuation_key", continuation);
      const data = await this.request<{ transactions: ProviderTransaction[]; continuation_key?: string | null }>(
        "GET",
        `/accounts/${encodeURIComponent(accountUid)}/transactions?${params}`,
      );
      all.push(...data.transactions);
      if (!data.continuation_key) return all;
      continuation = data.continuation_key;
    }
    throw new BankSyncError("unavailable", "Enable Banking: too many transaction pages");
  }

  async revokeSession(sessionId: string) {
    try {
      await this.request("DELETE", `/sessions/${encodeURIComponent(sessionId)}`);
    } catch (error) {
      // Already closed or expired at the bank: nothing left to revoke.
      if (!(error instanceof BankSyncError && error.kind === "expired")) throw error;
    }
  }
}

function toAccount(a: EbAccount): ProviderAccount {
  return {
    uid: a.uid,
    iban: a.account_id?.iban ?? null,
    // `name` is the account holder; product/details describe the account.
    name: a.product || a.details || a.name || "Account",
    currency: a.currency ?? "EUR",
    cashAccountType: a.cash_account_type ?? null,
  };
}
