import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { StatementIssue } from "@/lib/domain/validation";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const cents = (name: string) => bigint(name, { mode: "number" });

export const memberRole = pgEnum("member_role", ["owner", "member"]);
export const accountType = pgEnum("account_type", ["checking", "savings", "credit", "investment"]);
export const statementStatus = pgEnum("statement_status", [
  "uploaded",
  "processing",
  "needs_account",
  "needs_review",
  "confirmed",
  "failed",
]);
export const categoryKind = pgEnum("category_kind", ["expense", "income", "transfer"]);
export const categorizedBy = pgEnum("categorized_by", ["rule", "merchant", "llm", "user", "transfer"]);
export const matchType = pgEnum("match_type", ["contains", "regex", "merchant"]);
export const transactionSource = pgEnum("transaction_source", ["statement", "bank"]);
export const bankConnectionStatus = pgEnum("bank_connection_status", ["active", "expired", "revoked", "error"]);
export const bankSyncTrigger = pgEnum("bank_sync_trigger", ["initial", "cron", "manual"]);

/** Mirrors Supabase `auth.users` ids (profiles table). */
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  /** Language for emails; the UI follows the `locale` cookie. */
  locale: text("locale").notNull().default("en"),
  createdAt: createdAt(),
});

export const households = pgTable("households", {
  id: id(),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull().default("EUR"),
  createdAt: createdAt(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] }), uniqueIndex("one_household_per_user").on(t.userId)],
);

export const householdInvites = pgTable("household_invites", {
  id: id(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const banks = pgTable("banks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  color: text("color").notNull().default("#64748b"),
  /** Strings found in statement text that identify this bank. */
  detectKeywords: text("detect_keywords").array().notNull().default(sql`'{}'::text[]`),
});

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    bankId: text("bank_id")
      .notNull()
      .references(() => banks.id),
    name: text("name").notNull(),
    ibanLast4: text("iban_last4"),
    ibanHash: text("iban_hash"),
    currency: text("currency").notNull().default("EUR"),
    type: accountType("type").notNull().default("checking"),
    isPrivate: boolean("is_private").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("accounts_household_idx").on(t.householdId), uniqueIndex("accounts_iban_hash_idx").on(t.householdId, t.ibanHash)],
);

export const accountOwners = pgTable(
  "account_owners",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sharePct: real("share_pct").notNull().default(100),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.userId] })],
);

export type DetectedStatementInfo = {
  bankId: string | null;
  ibanLast4: string | null;
  ibanHash: string | null;
  pageCount: number;
  /** The parser that read the statement: a bank id or "generic". */
  provider?: string;
  skippedDuplicates?: number;
  /** Rows left out because bank sync covers their dates for this account. */
  skippedBankSynced?: number;
};

export const statements = pgTable(
  "statements",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    fileName: text("file_name").notNull(),
    filePath: text("file_path").notNull(),
    fileSha256: text("file_sha256").notNull(),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    openingBalanceCents: cents("opening_balance_cents"),
    closingBalanceCents: cents("closing_balance_cents"),
    currency: text("currency"),
    status: statementStatus("status").notNull().default("uploaded"),
    progress: text("progress"),
    /** Last time processing reported progress; used to detect abandoned jobs (see lib/statement-processing). */
    progressAt: timestamp("progress_at", { withTimezone: true }).notNull().defaultNow(),
    error: text("error"),
    issues: jsonb("issues").$type<StatementIssue[]>().notNull().default([]),
    detected: jsonb("detected").$type<DetectedStatementInfo>(),
    parserVersion: text("parser_version"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("statements_file_idx").on(t.householdId, t.fileSha256), index("statements_account_idx").on(t.accountId)],
);

export const categories = pgTable(
  "categories",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: categoryKind("kind").notNull(),
    icon: text("icon").notNull().default("circle"),
    color: text("color").notNull().default("#64748b"),
  },
  (t) => [uniqueIndex("categories_slug_idx").on(t.householdId, t.slug)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    statementId: uuid("statement_id").references(() => statements.id, { onDelete: "cascade" }),
    bookedAt: date("booked_at").notNull(),
    valueDate: date("value_date"),
    descriptionRaw: text("description_raw").notNull(),
    merchant: text("merchant"),
    amountCents: cents("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    balanceAfterCents: cents("balance_after_cents"),
    position: integer("position").notNull().default(0),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    categorizedBy: categorizedBy("categorized_by"),
    categoryConfidence: real("category_confidence"),
    // The rule that set the category; only meaningful while categorizedBy is "rule".
    ruleId: uuid("rule_id").references((): AnyPgColumn => categoryRules.id, { onDelete: "set null" }),
    isConfirmed: boolean("is_confirmed").notNull().default(false),
    flagged: boolean("flagged").notNull().default(false),
    flagReason: text("flag_reason"),
    transferGroupId: uuid("transfer_group_id"),
    notes: text("notes"),
    // Set when the user removes the row: it stays so re-imports of the statement keep skipping it.
    excludedAt: timestamp("excluded_at", { withTimezone: true }),
    fingerprint: text("fingerprint").notNull(),
    /** Where the row came from: a PDF statement or bank sync (open banking). */
    source: transactionSource("source").notNull().default("statement"),
    /** The bank's own id for the transaction (bank sync only), when it provides one. */
    externalId: text("external_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("transactions_fingerprint_idx").on(t.accountId, t.fingerprint),
    index("transactions_household_date_idx").on(t.householdId, t.bookedAt),
    index("transactions_statement_idx").on(t.statementId),
  ],
);

export const categoryRules = pgTable("category_rules", {
  id: id(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  matchType: matchType("match_type").notNull(),
  pattern: text("pattern").notNull(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  priority: integer("priority").notNull().default(100),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  hits: integer("hits").notNull().default(0),
  lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const transactionChanges = pgTable(
  "transaction_changes",
  {
    id: id(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    createdAt: createdAt(),
  },
  (t) => [index("transaction_changes_tx_idx").on(t.transactionId)],
);

export const dismissedSuggestions = pgTable(
  "dismissed_suggestions",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.key] })],
);

/**
 * Monthly spending budgets per expense category. A row applies from `month` (first day of the month) until the next
 * row for the same category, so a budget carries forward without a row per month; amount 0 means "no budget".
 */
export const budgets = pgTable(
  "budgets",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    amountCents: cents("amount_cents").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.month] }), index("budgets_household_idx").on(t.householdId)],
);

/**
 * A consent to read accounts at one bank through an open banking provider (see OPEN_BANKING.md). Only its creator
 * can sync, reconnect or disconnect it. Provider ids are encrypted at rest.
 */
export const bankConnections = pgTable(
  "bank_connections",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    bankName: text("bank_name").notNull(),
    bankCountry: text("bank_country").notNull(),
    /** Matching row in `banks`, for logos and new accounts. */
    bankId: text("bank_id")
      .notNull()
      .references(() => banks.id),
    sessionIdEnc: text("session_id_enc"),
    status: bankConnectionStatus("status").notNull().default("active"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    /** Days-before-expiry of the last reminder sent (14 or 3), so each is sent once per consent. */
    remindedDays: integer("reminded_days"),
    createdAt: createdAt(),
  },
  (t) => [index("bank_connections_household_idx").on(t.householdId)],
);

/** An account shared through a connection, and the app account it feeds once mapped. */
export const bankConnectionAccounts = pgTable(
  "bank_connection_accounts",
  {
    id: id(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => bankConnections.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    providerAccountUidEnc: text("provider_account_uid_enc").notNull(),
    ibanHash: text("iban_hash"),
    ibanLast4: text("iban_last4"),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("EUR"),
    accountType: accountType("account_type").notNull().default("checking"),
    /** First date bank sync imports. Always after the account's PDF coverage; null until the user confirms it. */
    syncFrom: date("sync_from"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastBalanceCents: cents("last_balance_cents"),
    lastBalanceAt: timestamp("last_balance_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("bank_connection_accounts_connection_idx").on(t.connectionId),
    // One bank feed per app account.
    uniqueIndex("bank_connection_accounts_account_idx").on(t.accountId),
  ],
);

/** One sync attempt; used for "updated X ago", debugging and the daily access limit. */
export const bankSyncRuns = pgTable(
  "bank_sync_runs",
  {
    id: id(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => bankConnections.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    trigger: bankSyncTrigger("trigger").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    inserted: integer("inserted").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("bank_sync_runs_connection_idx").on(t.connectionId, t.startedAt)],
);

export type User = typeof users.$inferSelect;
export type Household = typeof households.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Statement = typeof statements.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Rule = typeof categoryRules.$inferSelect;
export type Bank = typeof banks.$inferSelect;
