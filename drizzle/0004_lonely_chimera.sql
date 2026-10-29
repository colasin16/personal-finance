ALTER TABLE "category_rules" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "category_rules" ADD COLUMN "last_matched_at" timestamp with time zone;