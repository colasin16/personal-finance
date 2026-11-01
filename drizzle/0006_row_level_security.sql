-- Row Level Security for every table. User requests run as the `authenticated` role with
-- `request.jwt.claim.sub` set to the user's id (see getUserDb in src/lib/db/index.ts); the same policies
-- protect Supabase's Data API. Supabase provides the `authenticated` role and auth.uid(); elsewhere
-- (PGlite, plain Postgres) they are created here.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS auth;
--> statement-breakpoint
DO $$ BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
--> statement-breakpoint
-- TRUNCATE ignores RLS, and the app never needs it as a user.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
--> statement-breakpoint
-- Signed-out visitors (Supabase's `anon`) never need table access.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
  END IF;
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM public;
  END IF;
END $$;
--> statement-breakpoint
-- Policy helpers live in a schema the Data API doesn't expose. They return arrays so policies can call
-- them once per query as `(select private.fn())` instead of once per row.
CREATE SCHEMA IF NOT EXISTS private;
--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.my_household_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select coalesce(array_agg(m.household_id), '{}') from public.household_members m where m.user_id = auth.uid();
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.my_owned_household_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select coalesce(array_agg(m.household_id), '{}') from public.household_members m where m.user_id = auth.uid() and m.role = 'owner';
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.my_account_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select coalesce(array_agg(o.account_id), '{}') from public.account_owners o where o.user_id = auth.uid();
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.visible_account_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select coalesce(array_agg(a.id), '{}')
  from public.accounts a
  join public.household_members m on m.household_id = a.household_id and m.user_id = auth.uid()
  where not a.is_private or exists (select 1 from public.account_owners o where o.account_id = a.id and o.user_id = auth.uid());
$$;
--> statement-breakpoint
-- Ownership of an account can be changed by anyone who can see it, and set on a new account that has no owners yet.
CREATE OR REPLACE FUNCTION private.can_manage_owners(aid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select exists (
    select 1 from public.accounts a
    join public.household_members m on m.household_id = a.household_id and m.user_id = auth.uid()
    where a.id = aid and (
      not a.is_private
      or exists (select 1 from public.account_owners o where o.account_id = a.id and o.user_id = auth.uid())
      or not exists (select 1 from public.account_owners o where o.account_id = a.id)
    )
  );
$$;
--> statement-breakpoint
-- Owners must belong to the account's household.
CREATE OR REPLACE FUNCTION private.is_account_household_member(aid uuid, uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select exists (
    select 1 from public.accounts a join public.household_members m on m.household_id = a.household_id
    where a.id = aid and m.user_id = uid
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.is_household_member(hid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select hid = any(private.my_household_ids());
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.can_see_account(aid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select aid = any(private.visible_account_ids());
$$;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM public;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.can_see_account(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.is_household_member(uuid);
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE account_owners ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE transaction_changes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE dismissed_suggestions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Policies from the hand-applied supabase/rls.sql, replaced below.
DROP POLICY IF EXISTS users_self_or_partner ON users;
--> statement-breakpoint
DROP POLICY IF EXISTS users_update_self ON users;
--> statement-breakpoint
DROP POLICY IF EXISTS banks_read ON banks;
--> statement-breakpoint
DROP POLICY IF EXISTS households_member ON households;
--> statement-breakpoint
DROP POLICY IF EXISTS members_member ON household_members;
--> statement-breakpoint
DROP POLICY IF EXISTS invites_member ON household_invites;
--> statement-breakpoint
DROP POLICY IF EXISTS accounts_visible ON accounts;
--> statement-breakpoint
DROP POLICY IF EXISTS owners_visible ON account_owners;
--> statement-breakpoint
DROP POLICY IF EXISTS statements_visible ON statements;
--> statement-breakpoint
DROP POLICY IF EXISTS transactions_visible ON transactions;
--> statement-breakpoint
DROP POLICY IF EXISTS categories_member ON categories;
--> statement-breakpoint
DROP POLICY IF EXISTS rules_member ON category_rules;
--> statement-breakpoint
DROP POLICY IF EXISTS changes_visible ON transaction_changes;
--> statement-breakpoint
DROP POLICY IF EXISTS dismissed_member ON dismissed_suggestions;
--> statement-breakpoint
-- Users, households, memberships and invite acceptance are created by the server (system connection), not as a user.
CREATE POLICY users_select ON users FOR SELECT USING (
  id = (select auth.uid())
  or id in (select m.user_id from household_members m where m.household_id = any((select private.my_household_ids())::uuid[]))
);
--> statement-breakpoint
CREATE POLICY users_update ON users FOR UPDATE USING (id = (select auth.uid())) WITH CHECK (id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY banks_select ON banks FOR SELECT USING ((select auth.uid()) is not null);
--> statement-breakpoint
CREATE POLICY households_select ON households FOR SELECT USING (id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY households_update ON households FOR UPDATE USING (id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY households_delete ON households FOR DELETE USING (id = any((select private.my_owned_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY members_select ON household_members FOR SELECT USING (household_id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY invites_select ON household_invites FOR SELECT USING (household_id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY invites_insert ON household_invites FOR INSERT WITH CHECK (
  household_id = any((select private.my_owned_household_ids())::uuid[]) and invited_by = (select auth.uid())
);
--> statement-breakpoint
CREATE POLICY invites_delete ON household_invites FOR DELETE USING (household_id = any((select private.my_owned_household_ids())::uuid[]));
--> statement-breakpoint
-- Checked on the row's own columns (not by id), so an INSERT ... RETURNING of a new shared account passes.
CREATE POLICY accounts_select ON accounts FOR SELECT USING (
  household_id = any((select private.my_household_ids())::uuid[]) and (not is_private or id = any((select private.my_account_ids())::uuid[]))
);
--> statement-breakpoint
CREATE POLICY accounts_insert ON accounts FOR INSERT WITH CHECK (household_id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY accounts_update ON accounts FOR UPDATE
  USING (household_id = any((select private.my_household_ids())::uuid[]) and (not is_private or id = any((select private.my_account_ids())::uuid[])))
  WITH CHECK (household_id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY accounts_delete ON accounts FOR DELETE USING (
  household_id = any((select private.my_household_ids())::uuid[]) and (not is_private or id = any((select private.my_account_ids())::uuid[]))
);
--> statement-breakpoint
CREATE POLICY owners_select ON account_owners FOR SELECT USING (account_id = any((select private.visible_account_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY owners_insert ON account_owners FOR INSERT WITH CHECK (private.can_manage_owners(account_id) and private.is_account_household_member(account_id, user_id));
--> statement-breakpoint
CREATE POLICY owners_update ON account_owners FOR UPDATE
  USING (private.can_manage_owners(account_id))
  WITH CHECK (private.can_manage_owners(account_id) and private.is_account_household_member(account_id, user_id));
--> statement-breakpoint
CREATE POLICY owners_delete ON account_owners FOR DELETE USING (private.can_manage_owners(account_id));
--> statement-breakpoint
-- Unassigned statements are visible only to whoever uploaded them.
CREATE POLICY statements_select ON statements FOR SELECT USING (
  household_id = any((select private.my_household_ids())::uuid[])
  and (account_id = any((select private.visible_account_ids())::uuid[]) or (account_id is null and uploaded_by = (select auth.uid())))
);
--> statement-breakpoint
CREATE POLICY statements_insert ON statements FOR INSERT WITH CHECK (
  household_id = any((select private.my_household_ids())::uuid[])
  and uploaded_by = (select auth.uid())
  and (account_id is null or account_id = any((select private.visible_account_ids())::uuid[]))
);
--> statement-breakpoint
CREATE POLICY statements_update ON statements FOR UPDATE
  USING (
    household_id = any((select private.my_household_ids())::uuid[])
    and (account_id = any((select private.visible_account_ids())::uuid[]) or (account_id is null and uploaded_by = (select auth.uid())))
  )
  WITH CHECK (
    household_id = any((select private.my_household_ids())::uuid[])
    and (account_id = any((select private.visible_account_ids())::uuid[]) or (account_id is null and uploaded_by = (select auth.uid())))
  );
--> statement-breakpoint
CREATE POLICY statements_delete ON statements FOR DELETE USING (
  household_id = any((select private.my_household_ids())::uuid[])
  and (account_id = any((select private.visible_account_ids())::uuid[]) or (account_id is null and uploaded_by = (select auth.uid())))
);
--> statement-breakpoint
CREATE POLICY transactions_all ON transactions FOR ALL
  USING (account_id = any((select private.visible_account_ids())::uuid[]))
  WITH CHECK (account_id = any((select private.visible_account_ids())::uuid[]) and household_id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY changes_all ON transaction_changes FOR ALL
  USING (transaction_id in (select t.id from transactions t where t.account_id = any((select private.visible_account_ids())::uuid[])))
  WITH CHECK (transaction_id in (select t.id from transactions t where t.account_id = any((select private.visible_account_ids())::uuid[])));
--> statement-breakpoint
CREATE POLICY categories_all ON categories FOR ALL
  USING (household_id = any((select private.my_household_ids())::uuid[]))
  WITH CHECK (household_id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY rules_all ON category_rules FOR ALL
  USING (household_id = any((select private.my_household_ids())::uuid[]))
  WITH CHECK (household_id = any((select private.my_household_ids())::uuid[]));
--> statement-breakpoint
CREATE POLICY dismissed_all ON dismissed_suggestions FOR ALL
  USING (household_id = any((select private.my_household_ids())::uuid[]))
  WITH CHECK (household_id = any((select private.my_household_ids())::uuid[]));
