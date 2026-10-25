-- Row Level Security for Supabase deployments (defense in depth on top of app-level checks).
-- Apply after the Drizzle migrations:  psql "$DATABASE_URL" -f supabase/rls.sql
-- Assumes users.id = auth.users.id (insert a users row on sign-up, e.g. via a trigger).

create or replace function public.is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members m where m.household_id = hid and m.user_id = auth.uid());
$$;

create or replace function public.can_see_account(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from accounts a
    where a.id = aid
      and public.is_household_member(a.household_id)
      and (not a.is_private or exists (select 1 from account_owners o where o.account_id = a.id and o.user_id = auth.uid()))
  );
$$;

alter table users enable row level security;
alter table households enable row level security;
alter table household_members enable row level security;
alter table household_invites enable row level security;
alter table banks enable row level security;
alter table accounts enable row level security;
alter table account_owners enable row level security;
alter table statements enable row level security;
alter table transactions enable row level security;
alter table categories enable row level security;
alter table category_rules enable row level security;
alter table transaction_changes enable row level security;
alter table dismissed_suggestions enable row level security;

drop policy if exists users_self_or_partner on users;
create policy users_self_or_partner on users for select using (
  id = auth.uid() or exists (
    select 1 from household_members me join household_members them on them.household_id = me.household_id
    where me.user_id = auth.uid() and them.user_id = users.id
  )
);
drop policy if exists users_update_self on users;
create policy users_update_self on users for update using (id = auth.uid());

drop policy if exists banks_read on banks;
create policy banks_read on banks for select using (auth.uid() is not null);

drop policy if exists households_member on households;
create policy households_member on households for all using (public.is_household_member(id));

drop policy if exists members_member on household_members;
create policy members_member on household_members for select using (public.is_household_member(household_id));

drop policy if exists invites_member on household_invites;
create policy invites_member on household_invites for all using (public.is_household_member(household_id));

drop policy if exists accounts_visible on accounts;
create policy accounts_visible on accounts for all using (public.can_see_account(id)) with check (public.is_household_member(household_id));

drop policy if exists owners_visible on account_owners;
create policy owners_visible on account_owners for all using (public.can_see_account(account_id));

drop policy if exists statements_visible on statements;
create policy statements_visible on statements for all using (
  public.is_household_member(household_id) and (account_id is null or public.can_see_account(account_id))
);

drop policy if exists transactions_visible on transactions;
create policy transactions_visible on transactions for all using (public.can_see_account(account_id));

drop policy if exists categories_member on categories;
create policy categories_member on categories for all using (public.is_household_member(household_id));

drop policy if exists rules_member on category_rules;
create policy rules_member on category_rules for all using (public.is_household_member(household_id));

drop policy if exists changes_visible on transaction_changes;
create policy changes_visible on transaction_changes for all using (
  exists (select 1 from transactions t where t.id = transaction_id and public.can_see_account(t.account_id))
);

drop policy if exists dismissed_member on dismissed_suggestions;
create policy dismissed_member on dismissed_suggestions for all using (public.is_household_member(household_id));

-- Storage: private bucket "statements", objects stored as "<household_id>/<statement_id>.pdf".
-- insert into storage.buckets (id, name, public) values ('statements', 'statements', false) on conflict do nothing;
-- create policy statements_files on storage.objects for all using (
--   bucket_id = 'statements' and public.is_household_member(((storage.foldername(name))[1])::uuid)
-- );
