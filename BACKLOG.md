# Backlog

Upcoming work, roughly in priority order. Move an item to `PLAN.md` (or delete it) once it ships.

## 1. Explicit reimbursement links

The dashboard nets money that comes back into an expense category against that category, per period and per cash-flow bucket (`netCashFlow` in `src/lib/domain/cashflow.ts`). A reimbursement that arrives in a later period than the expense therefore lowers the later period's spending, not the original's.

**Idea:** let users link an income transaction to the expense it reimburses, similar to manual transfer linking. That would net across periods, allow partial splits ("they paid half of this dinner"), and could show the link on both transactions.

## 2. Remaining security and privacy work

Follow-ups from `SECURITY_PRIVACY_AUDIT.md`, in priority order. C1, C2, H1, H2, H3 and most of H4 are already fixed.

- **PDF retention (C3):** delete original PDFs after a statement is confirmed (or after N days), with a household setting. Also move encryption keys to a KMS with per-household data keys and rotation. Today one `DATA_ENCRYPTION_KEY` covers everything.
- **Least-privilege login role (H3 follow-up):** signed-in requests already run under RLS, because `getUserDb()` switches each query to the `authenticated` role. But `DATABASE_URL` still logs in as `postgres`, which bypasses RLS and can switch back. RLS therefore doesn't protect against:
  - request code that mistakenly uses `getSystemDb()`;
  - an SQL injection that runs `reset role`;
  - a leaked `DATABASE_URL`, which gives full database access.

  Steps:
  1. **Restricted login role:** in a migration, create a login role such as `app_web` (`LOGIN NOBYPASSRLS`, member of `authenticated`, no table grants of its own). Point `DATABASE_URL` at it through the Supabase pooler (user `app_web.<project-ref>`).
  2. **Separate privileged connection:** `getSystemDb()` (sign-in, onboarding, invites, statement pipeline) reads a new `DATABASE_SYSTEM_URL`. Later, replace those uses with narrow `SECURITY DEFINER` functions (e.g. `accept_invite`, `create_household`, cross-account transfer linking) and run the pipeline as the uploader, so the web runtime never holds privileged credentials.
  3. **Migrations outside Vercel:** run `db:migrate` from CI (e.g. a GitHub Action with its own secret) instead of `vercel-build`, because Vercel exposes build environment variables at runtime too.
  4. **Measure the cost** of the per-query transaction that sets the RLS user (`src/lib/db/index.ts`, about 3 round trips per query).
- **Invite tokens (H4):** store only a hash of the token. Onboarding currently reads `pendingInvitesFor(email)` tokens, so it needs to accept invites by id for the signed-in email instead.
- **MFA (M2):** TOTP or passkeys, plus re-authentication before inviting people or changing account owners.
- **Hardening (M1, M3, M4, M6):** revocable server-side sessions for mock auth, security headers (CSP, `frame-ancestors`, `Referrer-Policy`), rate limiting on sign-in and upload, and scrubbing statement text and SQL from logs.
- **Audit log and GDPR (M5, M7):** an access audit log, data export, and consent before analytics and Brandfetch logos. Account and household deletion is §3.

## 3. Delete my account

Deleting a user in the Supabase dashboard (Authentication → Users) only removes their login (`auth.users`). Nothing references `auth.users`, so all app data stays. If the same email signs up again, `ensureAuthUser` (`src/lib/households.ts`) matches the old `public.users` row by email and they get everything back. Users need a real way to delete their account and data (GDPR right to erasure).

**What deleting cascades today** (`src/lib/db/schema.ts`):
- Deleting a `users` row removes their `household_members` and `account_owners` rows. It sets `statements.uploaded_by`, `category_rules.created_by`, `household_invites.invited_by` and `transaction_changes.user_id` to null.
- Deleting a `households` row removes accounts, statements, transactions, categories, rules, invites and dismissed suggestions.
- Statement files in storage are **never** removed by the database. Delete them with `getStorage().remove(key)`.

**Plan:**
1. Add a "Delete account" danger-zone section in settings. The user confirms by typing their email or the household name. Re-authenticate first (send an email code) once MFA / re-auth (M2) exists.
2. Add a server action `deleteAccount`. Use `getSystemDb()`, because it touches other members' rows and `auth.users`. In one transaction:
   - **Sole member of the household:** collect the household's statement file keys, delete the household (cascade), then delete the `users` row.
   - **Shared household:**
     - Delete the accounts only this user owns, along with their statements and transactions. Collect those file keys first.
     - Remove the user from co-owned accounts.
     - If the user is the only owner of the household, either make the oldest remaining member owner or block deletion until ownership is transferred (decide which).
     - Delete the `users` row.
   - Decide what happens to private accounts and to shared data the user created; nulling the attribution columns is probably fine.
3. After the commit:
   - Remove the collected storage files. Make this best-effort and log failures so a retry job can clean up later.
   - Delete the Supabase auth user through the Admin API (`auth.admin.deleteUser`, service-role key, server-only).
   - Sign the user out and redirect to `/login` with a confirmation message.
4. Optional: add a migration so deleting the auth user also deletes the app user, as a safety net for dashboard deletions. Use a foreign key `users.id → auth.users(id) ON DELETE CASCADE`, guarded like `auth.uid()` in `drizzle/0006` for non-Supabase databases. Also stop `ensureAuthUser` from silently re-linking an orphaned profile by email.
5. Add an owner-only "Delete household" action that wipes everything, including the files of every member.
6. Tests: cascade coverage for both the sole-member and shared-household cases; storage cleanup is called; the auth user is deleted; the last-owner rule.

## 4. Budget follow-ups

The first version of `/budgets` has per-category monthly limits that carry forward, suggestions from average spending, and pace tracking. Not built yet:

- **Rollover:** an opt-in per category, carrying unspent (or overspent) money into the next month, like YNAB or Monarch.
- **Alerts:** notify (in-app, later email) when a category reaches ~85% or goes over.
- **Dashboard widget:** a compact "budget left this month" card linking to `/budgets`.
- **Income target and savings goal:** compare planned income vs. budgets to show what's left to save.
- **Per-member scope:** budgets are household-wide today; allow budgeting only "my" or "shared" spending.

## 5. Open banking (Enable Banking)

Sync our household's bank transactions daily through Enable Banking (PSD2, read-only), so budgets stay current without PDF uploads. Bank sync takes over each account from a start date; PDFs remain for older history. Full plan: [`OPEN_BANKING.md`](OPEN_BANKING.md).

Built and tested with the mock provider. Still to do:

- **Phase 0:** create the Enable Banking app, link our accounts, set the env vars and verify each bank (consent length, history depth, `entry_reference`, description quality).
- **Balance check:** flag an account when the bank balance and the last synced `balanceAfterCents` disagree.
- **Statements grid:** months after `sync_from` show as "missing" in the statement completeness grid; show them as covered by the bank instead.
- **Accounts page:** a "Bank sync" badge with the bank's latest balance.
- **Issues:** count connections that expire soon or have expired.
- **Deletion:** revoke the Enable Banking session when a user or household is deleted (ties into §3).
