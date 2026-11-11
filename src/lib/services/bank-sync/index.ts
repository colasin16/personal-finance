import { EnableBankingProvider, enableBankingConfig } from "./enable-banking";
import { MockBankProvider } from "./mock";
import type { BankSyncProvider } from "./types";

export * from "./types";

let override: BankSyncProvider | null = null;

/** Enable Banking when configured (ENABLE_BANKING_APP_ID + ENABLE_BANKING_PRIVATE_KEY), else the offline mock. */
export function getBankSyncProvider(): BankSyncProvider {
  if (override) return override;
  const config = enableBankingConfig();
  return config ? new EnableBankingProvider(config) : new MockBankProvider();
}

/** Tests only. */
export function setBankSyncProviderForTests(provider: BankSyncProvider | null) {
  override = provider;
}
