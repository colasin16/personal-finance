CREATE TYPE "public"."bank_connection_status" AS ENUM('active', 'expired', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."bank_sync_trigger" AS ENUM('initial', 'cron', 'manual');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('statement', 'bank');--> statement-breakpoint
CREATE TABLE "bank_connection_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid,
	"provider_account_uid_enc" text NOT NULL,
	"iban_hash" text,
	"iban_last4" text,
	"name" text NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"account_type" "account_type" DEFAULT 'checking' NOT NULL,
	"sync_from" date,
	"last_synced_at" timestamp with time zone,
	"last_balance_cents" bigint,
	"last_balance_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"provider" text NOT NULL,
	"bank_name" text NOT NULL,
	"bank_country" text NOT NULL,
	"bank_id" text NOT NULL,
	"session_id_enc" text,
	"status" "bank_connection_status" DEFAULT 'active' NOT NULL,
	"valid_until" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"reminded_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"trigger" "bank_sync_trigger" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"inserted" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "source" "transaction_source" DEFAULT 'statement' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "bank_connection_accounts" ADD CONSTRAINT "bank_connection_accounts_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connection_accounts" ADD CONSTRAINT "bank_connection_accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connection_accounts" ADD CONSTRAINT "bank_connection_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_bank_id_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_connection_accounts_connection_idx" ON "bank_connection_accounts" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_connection_accounts_account_idx" ON "bank_connection_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "bank_connections_household_idx" ON "bank_connections" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "bank_sync_runs_connection_idx" ON "bank_sync_runs" USING btree ("connection_id","started_at");--> statement-breakpoint
-- Row Level Security as in 0006: the household sees its bank connections; only a connection's creator changes it.
ALTER TABLE "bank_connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bank_connection_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bank_sync_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY bank_connections_select ON bank_connections FOR SELECT
  USING (household_id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY bank_connections_write ON bank_connections FOR ALL
  USING (created_by = (select auth.uid()) and household_id = any((select private.my_household_ids())::uuid[]))
  WITH CHECK (created_by = (select auth.uid()) and household_id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY bank_connection_accounts_select ON bank_connection_accounts FOR SELECT
  USING (household_id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY bank_connection_accounts_write ON bank_connection_accounts FOR ALL
  USING (exists (select 1 from bank_connections c where c.id = connection_id and c.created_by = (select auth.uid())))
  WITH CHECK (
    exists (
      select 1 from bank_connections c
      where c.id = connection_id and c.created_by = (select auth.uid()) and c.household_id = bank_connection_accounts.household_id
    )
    and (account_id is null or account_id = any((select private.visible_account_ids())::uuid[]))
  );
--> statement-breakpoint
CREATE POLICY bank_sync_runs_select ON bank_sync_runs FOR SELECT
  USING (household_id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY bank_sync_runs_write ON bank_sync_runs FOR ALL
  USING (exists (select 1 from bank_connections c where c.id = connection_id and c.created_by = (select auth.uid())))
  WITH CHECK (
    exists (
      select 1 from bank_connections c
      where c.id = connection_id and c.created_by = (select auth.uid()) and c.household_id = bank_sync_runs.household_id
    )
  );
