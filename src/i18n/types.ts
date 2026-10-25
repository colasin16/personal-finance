import type accounts from "../../messages/en/accounts.json";
import type auth from "../../messages/en/auth.json";
import type common from "../../messages/en/common.json";
import type dashboard from "../../messages/en/dashboard.json";
import type errors from "../../messages/en/errors.json";
import type importNs from "../../messages/en/import.json";
import type issues from "../../messages/en/issues.json";
import type settings from "../../messages/en/settings.json";
import type shell from "../../messages/en/shell.json";
import type statements from "../../messages/en/statements.json";
import type transactions from "../../messages/en/transactions.json";
import type { Locale } from "./config";

type Messages = {
  common: typeof common;
  shell: typeof shell;
  auth: typeof auth;
  dashboard: typeof dashboard;
  accounts: typeof accounts;
  settings: typeof settings;
  import: typeof importNs;
  statements: typeof statements;
  transactions: typeof transactions;
  issues: typeof issues;
  errors: typeof errors;
};

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
