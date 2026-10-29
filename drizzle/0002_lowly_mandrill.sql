DROP INDEX "statements_file_idx";--> statement-breakpoint
CREATE INDEX "statements_file_idx" ON "statements" USING btree ("household_id","file_sha256");