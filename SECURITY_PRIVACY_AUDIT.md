# Security and privacy review of the personal-finance app

**Short answer:** someone who gets into a database dump, the storage bucket or one household account would see almost everything, because nothing sensitive is encrypted inside the app. The full original bank PDFs are the biggest exposure. Signed-in access control is mostly sound, but I found a few real gaps, one of them critical. The app does not meet banking-grade standards (PSD2 SCA, PCI-style controls, DORA, full GDPR rights), which is normal for a hobby project but matters given the data it holds.

I only read the code; I didn't change anything or test any of these attacks against a running app.

## What it stores and how it's protected

| Data                                                                                          | Where                                                                              | Protection                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Original bank statement PDFs** (full name, address, full IBAN, every transaction, balances) | Supabase Storage (private bucket) or `.data/uploads` on local disk                 | Only the storage provider's default encryption at rest. **None in the app.** Kept forever unless the user deletes the statement.                                                  |
| Transactions (date, amount, balance, description, merchant, notes)                            | Postgres or PGlite                                                                 | Plaintext. Descriptions pass through `redactSensitive()` before parsing, so IBANs, cards, Spanish IDs, emails and phones are masked. Names of people in transfers are not masked. |
| IBAN                                                                                          | `accounts.iban_last4` and `iban_hash`                                              | The hash is `sha256(householdId:IBAN)` with no secret key, and `householdId` sits in the same row (see C2).                                                                       |
| Users                                                                                         | `users` (email, display name)                                                      | Plaintext                                                                                                                                                                         |
| Invite tokens                                                                                 | `household_invites.token`                                                          | Plaintext, 192-bit random                                                                                                                                                         |
| Secrets                                                                                       | Environment variables (`AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) | Not committed to git (`.env*` is ignored; only `.env.example` is tracked).                                                                                                        |

## Findings, most serious first

> **Status:** C1, C2, H1, H2, H3 and the email binding and owner-only parts of H4 are fixed. C3 is partly fixed: PDFs are now encrypted with an app key (`DATA_ENCRYPTION_KEY`), but KMS / per-household keys and retention are not done yet. For H3, signed-in requests now run under RLS and the policies ship as a Drizzle migration, but the login role is still privileged. The remaining items are tracked in `BACKLOG.md`.

### Critical

**C1. Mock sign-in can run in production, which means anyone can log in as anyone.**

- `src/lib/server/auth.ts` falls back to mock auth whenever `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` is missing. In production it only demands that `AUTH_SECRET` is set.
- In mock mode, `signIn` (`src/lib/actions/auth.ts`) does `findOrCreateUser(email)` and then `startSession` with no proof of owning the email.
- So if you deploy with `AUTH_SECRET` set but Supabase env vars missing or misspelled, typing the victim's email gives full access to their household.
- On top of that, `ALLOW_DEV_AUTH=1` without `AUTH_SECRET` signs sessions with the hard-coded `"dev-only-insecure-secret"`. Anyone can then forge a cookie for any user id.
- **Fix:** refuse to start in production unless real auth is configured.

**C2. The IBAN hash can be reversed, so the "store only last 4 + hash" promise doesn't hold.**

- Spanish IBANs have a fixed structure, and the bank code is known from the bank. With the last 4 digits also known, very few combinations are left to guess.
- The salt (`householdId`) is stored next to the hash, so an attacker with a database dump can recover full IBANs with ordinary hardware.
- **Fix:** use a keyed hash (HMAC with a server-side secret, ideally in a KMS).

**C3. Full PDFs are stored indefinitely without app-level encryption.**

- `PLAN.md §10` promises "signed URLs with short expiry" and an "option to delete original PDFs after confirmation". Neither is implemented.
- A leaked `SUPABASE_SERVICE_ROLE_KEY` exposes every statement for every household at once. That key bypasses all access rules and lives in the same runtime as the web app.

### High

**H1. Household members can take over each other's private accounts.**

- `updateAccount` and `archiveAccountAction` only check that the account is in the same household. They don't check that the caller can see it.
- A member who knows a private account's id can call `saveAccountAction` and make themselves the owner (`owners: [{ userId: self, sharePct: 100 }]`). That reveals all its transactions and its PDF.
- The ids are random UUIDs, which makes this harder, but it is a missing access check.

**H2. Unassigned statements aren't checked against the uploader.**

- `loadStatement` in `src/lib/actions/statements.ts` skips the visibility check when `accountId` is null.
- The file route and the status route do check `uploadedBy`.
- So another member can retry, delete, or `assignStatementAccountAction` a partner's unassigned statement into their own account. That parses the partner's transactions into an account the attacker can see.

**H3. Row Level Security doesn't protect the app's own queries.**

- The app connects through `DATABASE_URL` as a privileged role. That role bypasses RLS, so `supabase/rls.sql` only protects Supabase's public Data API.
- Every access rule therefore depends on application code being correct (H1 and H2 show it isn't always).
- `rls.sql` is applied by hand and isn't part of `db:migrate` or `vercel-build`. If someone forgets it on a Supabase project, the public tables may be readable through the REST API with the publishable key, unless Supabase's automatic RLS is turned on.

**H4. Invite links are bearer tokens.**

- `acceptInvite` never checks that the signed-in user's email matches the invite's email. Anyone who gets the link within 14 days joins the household.
- Tokens are stored in plaintext, and any member (not only the owner) can create invites.

### Medium

- **M1. Mock sessions can't be revoked.** The cookie is `userId.HMAC`, valid for 30 days, with no expiry inside it and no server-side session. Sign-out just deletes the cookie, so a stolen cookie keeps working until `AUTH_SECRET` is rotated.
- **M2. No MFA or strong customer authentication.** Sign-in is email-only (link or one-time code), so whoever controls the mailbox controls the finances. There is no step-up check before sensitive actions like inviting someone or changing account owners.
- **M3. No security headers.** `next.config.ts` sets no CSP, `frame-ancestors`, `Referrer-Policy` or `Permissions-Policy`. The PDF is served `inline`.
- **M4. No rate limiting of its own.** Sign-in, uploads (up to 50 × 15 MB) and actions rely entirely on Supabase or the host platform.
- **M5. No audit trail of who viewed what.** `transaction_changes` records edits only.
- **M6. Possible data in logs.** `console.error("[action]", error)` and the pipeline error logs can include SQL fragments or statement text that ends up with the hosting provider.
- **M7. Third-party calls leak browsing data.** `@vercel/analytics` and Brandfetch logo hotlinking send metadata, including which banks a user has, to third parties without a consent prompt.

### What's done well

- Server-side authorization is consistently scoped by household and visible account in queries, transactions and API routes.
- Inputs are validated with zod and SQL is parameterised through Drizzle (no injection found).
- The local-disk storage blocks path traversal, and uploads check size and the PDF header.
- The `next` redirect after login is validated (`safeNext`), and sign-in links use PKCE or a one-time code.
- Session cookies are `httpOnly`, `secure` in production and `sameSite=lax`. The HMAC is compared in constant time.
- The PDF response sends `Cache-Control: private, no-store` and `nosniff`.
- Identifiers are redacted before statement text is parsed or stored.
- RLS policies exist and are tested (`tests/rls.test.ts`).

## Compared with banking-app standards

| Requirement                                                         | Status                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **PSD2 SCA** (two of: knowledge, possession, inherence)             | ❌ Email only                                                                                                        |
| **GDPR** Art. 5 storage limitation and minimisation                 | ❌ PDFs kept forever, IBAN hash reversible                                                                           |
| **GDPR** Art. 15/17/20 (access, erasure, portability)               | ❌ No user/household deletion or data export                                                                         |
| **GDPR** Art. 32 (encryption, pseudonymisation)                     | ⚠️ Provider default only, no app-level or per-tenant encryption                                                      |
| **GDPR** Art. 30/33 (records, breach detection)                     | ❌ No access audit log or alerting                                                                                   |
| **PCI DSS** (card data)                                             | ✅ Card numbers redacted, no card data stored                                                                        |
| **DORA / EBA ICT guidelines** (key management, logging, resilience) | ❌ No KMS or key rotation; service-role key in the web runtime; jobs not durable                                     |
| **OWASP ASVS L2/L3**                                                | ⚠️ Missing session revocation, MFA, CSP/security headers, rate limiting, and access checks on owned objects (H1, H2) |
| Least privilege on the database                                     | ❌ The app uses a role that bypasses RLS                                                                             |

## How bad would a breach be?

| Scenario                                  | Impact                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Database dump                             | Every household's full transaction history, balances, notes, emails, and recoverable IBANs (C2).            |
| Leaked service-role key or storage access | Every original bank PDF for every user: name, address, full IBAN, complete history. This is the worst case. |
| Bad deploy config (C1)                    | Remote takeover of any account using only an email address.                                                 |
| Malicious or compromised household member | Can reach a partner's private accounts and statements (H1, H2).                                             |
| Compromised mailbox                       | Full access, because there is no second factor.                                                             |

## Suggested fixes in priority order

1. In production, fail closed when Supabase Auth isn't configured, and remove the hard-coded dev secret path (C1).
2. Add visibility and uploader checks to `updateAccount`, `archiveAccountAction` and `loadStatement` (H1, H2).
3. Replace the IBAN hash with an HMAC keyed by a server-side secret, and rehash existing rows (C2).
4. Encrypt PDFs per household before upload, using keys from a KMS. Add automatic deletion after confirmation and a retention policy (C3).
5. Run the app as a non-privileged database role so RLS applies to it too, and apply `rls.sql` as part of migrations (H3).
6. Bind invites to the invited email, store only a hash of the token, and limit invites to the household owner (H4).
7. Add MFA (TOTP or passkeys) and re-authentication before sensitive actions (M2).
8. Add security headers, rate limiting, an access audit log, account deletion and data export, and consent for analytics and logos (M3–M7).

If you want, I can turn these into items in `BACKLOG.md`, or fix C1, H1 and H2 directly; those three are small, contained code changes.
