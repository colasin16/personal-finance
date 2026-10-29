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

/** Mirrors Supabase `auth.users` ids (profiles table). */
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
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

export type User = typeof users.$inferSelect;
export type Household = typeof households.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Statement = typeof statements.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Rule = typeof categoryRules.$inferSelect;
export type Bank = typeof banks.$inferSelect;
