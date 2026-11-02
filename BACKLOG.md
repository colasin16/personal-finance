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
- **Audit log and GDPR (M5, M7):** an access audit log, account and household deletion, data export, and consent before analytics and Brandfetch logos.
