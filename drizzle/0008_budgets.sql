CREATE TABLE "budgets" (
	"household_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"month" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_category_id_month_pk" PRIMARY KEY("category_id","month")
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_household_idx" ON "budgets" USING btree ("household_id");--> statement-breakpoint
-- Row Level Security as in 0006: household members manage their household's budgets, for its own categories only.
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY budgets_all ON budgets FOR ALL
  USING (household_id = any((select private.my_household_ids())::uuid[]))
  WITH CHECK (
    household_id = any((select private.my_household_ids())::uuid[])
    and exists (select 1 from categories c where c.id = category_id and c.household_id = budgets.household_id)
  );
