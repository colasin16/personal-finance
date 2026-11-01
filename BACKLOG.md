# Backlog

Upcoming work, roughly in priority order. Move an item to `PLAN.md` (or delete it) once it ships.

## 1. Income categorized as an expense category should offset that category's spending (needs investigation)

**Problem:** we pay 100 € at a restaurant, a friend sends us 50 € back (Bizum/transfer) and we categorize that income as *Restaurants*. The real restaurant spend is 50 €, but the dashboard shows 100 €. It also counts the 50 € as income.

**Today:** in `getDashboard` (`src/lib/queries.ts`, "Category ranking & top merchants") every transaction with `amount >= 0` is skipped, so the ranking, top merchants and the spending KPI only look at outflows. Income totals include any positive amount regardless of its category's kind.

**Open questions to investigate:**
- **Rule:** should a positive amount in an *expense*-kind category always be a refund/reimbursement that nets against spending, instead of counting as income? It probably should, but check how this affects the Income, Spending and Saved KPIs and the cash-flow chart, so we don't double count.
- **Negative net:** what happens when a category nets out negative for the period, i.e. more reimbursed than spent? Clamp it to 0, show it as a credit, or allow it?
- **Period boundaries:** the reimbursement may arrive in a different month or period than the expense. Net by period, or link the reimbursement to the original expense?
- **Explicit link:** would an explicit link help, like the manual transfer linking? For example, "this income reimburses that expense". It also enables partial splits, e.g. "they paid half of this dinner".
- **Shared accounts:** how does this interact with shared-account shares (`applyShare`) and per-member scopes?
- **Other views:** top merchants, the "biggest expense" markers on the net-worth chart, and the per-category transaction totals in the Transactions page should all agree.
- **UI:** show gross vs net (e.g. "100 € spent · 50 € reimbursed") in the category breakdown?

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
