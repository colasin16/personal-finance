# Open banking plan (Enable Banking)

Goal: read our household's bank transactions automatically every day, so `/budgets` (and later the whole app) stays current without uploading PDF statements. This is read-only (PSD2 account information). No payments.

## Status

Phases 1–6 are implemented and tested against an offline mock provider (used whenever the Enable Banking keys aren't set). **Phase 0 is still to do**: create the Enable Banking app, link our accounts in restricted mode, set `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` and `CRON_SECRET`, then check each bank against "To verify during the spike" below. The Enable Banking client was written from the public API docs and hasn't talked to the real API yet.

Where things live:
- Provider adapter: `src/lib/services/bank-sync/` (`enable-banking.ts`, `mock.ts`).
- Pure rules (mapping, fingerprints, dates, reminders, cutover): `src/lib/domain/bank-sync.ts`.
- Engine and queries: `src/lib/bank-sync.ts`. Server actions: `src/lib/actions/bank-sync.ts`.
- Routes: `/api/bank-sync/callback`, `/api/cron/bank-sync`. UI: **Settings → Bank connections** (`src/components/bank-sync/`), plus the status line and banner on `/budgets` and `/dashboard`.
- Tests: `tests/bank-sync.test.ts` and the "bank sync" block in `tests/domain.test.ts`.

Differences from the plan below:
- The engine is `src/lib/bank-sync.ts`, not `src/lib/bank-sync/sync.ts`.
- `bank_connections.reminded_days` (the last reminder sent, 14 or 3) replaces `reminded_at`.
- No `pnpm bank-sync` script; open `/api/cron/bank-sync` locally instead (no secret needed outside production).
- PDF statements keep their balance check on all rows; rows dropped by the cutover are only left out of the insert.
- The PDF cutover also skips rows inside the date range bank sync already filled, even after a disconnect.
- Not built yet (see BACKLOG §5): balance-mismatch flag, an expiry count in Issues, the Accounts page badge, revoking on user or household deletion.

## Decisions

| Topic | Decision |
|---|---|
| Provider | [Enable Banking](https://enablebanking.com), in its free **restricted production** mode. In this mode, accounts must be linked in the Enable Banking control panel before the app can read them. |
| Scope | Our household only for now. The design (provider adapter, per-household tables, RLS) shouldn't block a later paid contract with Enable Banking for other users. |
| Pending transactions | Import **booked** transactions only. Pending card payments are skipped until they settle, so budgets can lag 1–3 days. |
| How synced rows enter | Added **immediately**. They are auto-categorized with the existing rules, merchant and LLM categorizer, and transfers are auto-linked. Unclear rows are flagged and show up in Issues, like PDF rows. There is no review queue. |
| Existing transactions | **Bank sync never overwrites, re-categorizes or re-imports existing transactions.** PDF-imported rows were reviewed by users and are the source of truth for the dates they cover. Bank sync only **adds** rows for dates after an account's PDF coverage, and never updates or deletes any row it didn't create. |
| PDF vs bank overlap | **Cutover per account.** `sync_from` is always after the account's PDF coverage, and it can never be set earlier. From that date, only bank sync adds transactions. PDF statements import only the rows before that date, for older history. |
| Sync frequency | A **daily** cron, plus a manual "Sync now" button. Both stay under PSD2's limit of 4 unattended accesses per account per day. |

## How it works for users

1. In **Settings → Bank connections**, choose **Connect a bank**, then choose the bank.
2. The user is redirected to the bank's site or app, logs in and approves (SCA). The bank's consent screen lets them pick the accounts to share.
3. The user is redirected back to the app, which lists the shared accounts. Each one is matched to an existing account by IBAN, or the user picks or creates one.
4. The app sets a start date for each account:
   - If the account has PDF statements, it starts the day after the latest statement period. Earlier dates are locked, because PDF data is already reviewed.
   - If it has none, it starts as far back as the bank allows.

   The user can choose a later date, never an earlier one.
5. The first sync runs right away. After that it runs daily.
6. Every 90–180 days (it depends on the bank) consent expires. The app warns 14 and 3 days before, by email and with an in-app banner, and the user reconnects in two clicks.

Each partner connects the banks they hold. A joint account shared by both partners is matched once, by IBAN.

## Architecture

### 1. Provider adapter (`src/lib/services/bank-sync/`)

- Define a `BankSyncProvider` interface:
  - `listBanks(country)`;
  - `startAuth({ bank, redirectUrl, state, validUntil })` → `{ url }`;
  - `createSession(code)` → `{ sessionId, validUntil, accounts[] }`;
  - `getSession(sessionId)`;
  - `getBalances(accountUid)`;
  - `getTransactions(accountUid, { dateFrom, dateTo })`, an async iterator that follows `continuation_key`;
  - `revokeSession(sessionId)`.
- **Enable Banking implementation.**
  - Each request carries a short-lived RS256 JWT signed with the app's private key (`kid` = application id).
  - Endpoints:
    - `GET /aspsps`
    - `POST /auth`
    - `POST /sessions`
    - `GET /sessions/{id}`
    - `GET /accounts/{uid}/balances`
    - `GET /accounts/{uid}/transactions`
    - `DELETE /sessions/{id}`
- **Mock implementation (the default).**
  - It is selected when Enable Banking isn't configured.
  - It offers a fake bank and a consent page served by the app, and generates deterministic transactions from the `samples/` data.
  - The app and tests therefore run offline. Add it to `serviceModes()` as `bankSync: enableBanking | mockBank`.
- **Mapping to our transaction shape.**
  - `booking_date` → `bookedAt`, `value_date` → `valueDate`.
  - The amount comes from `transaction_amount` plus `credit_debit_indicator`; debits are negative.
  - The description comes from `remittance_information` joined with the creditor or debtor name. The merchant comes from that counterparty name.
  - `balance_after_transaction` → `balanceAfterCents`.
  - `entry_reference` → `externalId`.
  - Skip anything not in `BOOK` status, and anything not in EUR (log it).
- **Config.**
  - Environment variables: `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` (PEM) and `CRON_SECRET`.
  - These are never exposed to the client. Document them in the README.

### 2. Schema and migration (`drizzle/0009_bank_sync.sql`)

- **`bank_connections`**
  - Columns:
    - id, household_id, created_by (user);
    - provider, bank name and country;
    - `session_id_enc`, the session id encrypted with `src/lib/crypto.ts`;
    - status (`active` | `expired` | `revoked` | `error`);
    - `valid_until`, `last_synced_at`, `last_error`;
    - `reminded_at`, which records which expiry reminder was last sent;
    - created_at.
- **`bank_connection_accounts`**
  - Columns:
    - id, connection_id;
    - `account_id`, which links to `accounts` and stays null until the account is mapped;
    - `provider_account_uid_enc`, `iban_hash` (via `ibanHash()`), display name, currency;
    - `sync_from` (date), `last_synced_at`;
    - `last_balance_cents`, `last_balance_at`.
  - Constraint: unique `(account_id)` where it is active, so an account has one bank feed.
- **`bank_sync_runs`**
  - Columns: id, connection_id, trigger (`cron` | `manual` | `initial`), started_at, finished_at, inserted, skipped, error.
  - Used for the "updated X ago" label, debugging, and counting accesses per day.
- **`transactions` additions**
  - `source` enum (`statement` | `bank`, default `statement`).
  - `external_id` (nullable).
  - `statement_id` already allows null.
- **RLS**
  - Follow `drizzle/0006`: policies by `household_id = any(private.my_household_ids())`.
  - Only the connection's creator can reconnect or revoke it. Others in the household can see its status.

### 3. Connect flow

- **Routes and screens.** `Settings → Bank connections` lists connections, their status and expiry, the last sync, and the Sync now, Reconnect and Disconnect actions. Connecting works like this:
  1. A server action creates a signed `state` (household, user, nonce, expiry) and calls `startAuth`.
  2. The browser is redirected to the bank.
  3. `GET /api/bank-sync/callback?code&state` checks `state`, calls `createSession` and stores the connection and its accounts. It then goes to an account-mapping step.
- **Account mapping.**
  - Auto-match by `iban_hash`. If there's no match, let the user pick an account or create one (bank from the `banks` table, owner = current user).
  - Show `sync_from` with an explanation ("Your reviewed PDF statements cover up to 30 Sep, so bank sync starts on 1 Oct").
  - The minimum allowed date is the day after the latest `period_end` of the account's statements (or its latest PDF transaction, if later). The server enforces this too.
- **Errors.** Handle a cancelled consent, an unknown bank, and a bank that is down, each with an actionable message.

### 4. Sync engine (`src/lib/bank-sync.ts`)

1. **Choose what to sync.** For each active connection and each mapped account, fetch from `max(sync_from, last booked date − 7 days)` to today. The overlap catches late-booked rows. Fetched rows dated before `sync_from` are always dropped.
2. **Deduplicate.**
   - Fingerprint = `entry_reference` when present.
   - Otherwise use `transactionFingerprint()` (account, date, amount, normalized description, ordinal). Ordinals are computed per whole day, so overlapping fetch windows produce the same values.
   - Insert with `onConflictDoNothing` on the existing `(account_id, fingerprint)` unique index. Rows the user excluded keep their fingerprint, so they don't come back.
3. **Process (new rows only).**
   - Run `categorizeTransactions` only on the rows inserted in this run. Low-confidence categories get flagged, exactly as in `process-statement.ts`.
   - Auto-link transfers only when both sides are new bank rows. A match with an existing (reviewed) row is shown as a transfer suggestion for the user to accept, never linked automatically.
   - Existing rows are never updated: no category, merchant, notes, flags or exclusion changes.
4. **Record balances.** Store the latest balance on the connection account. Flag the account if the bank balance and the last `balanceAfterCents` disagree.
5. **Log the run.** Write a `bank_sync_runs` row, update `last_synced_at`, then `revalidatePath` the budgets, dashboard and transactions pages.

Errors:
- **Expired consent:** the status becomes `expired`, no retry, and a reminder is sent.
- **Rate limit or bank outage:** keep the status `active`, store `last_error`, and retry on the next run.

### 5. Scheduling

- `GET /api/cron/bank-sync` is protected by `Authorization: Bearer ${CRON_SECRET}`. It is scheduled daily in `vercel.json` (e.g. 05:00 UTC); the Hobby plan allows daily crons.
  - It runs with `getSystemDb()`, like the statement pipeline, and loops over households.
  - It stays within `maxDuration`, and connections it didn't reach are picked up on the next run.
- **Sync now** is a server action for the connection's owner. It is disabled when today's runs (cron + manual) for that connection already reach 3, keeping one slot spare.
- Locally (PGlite, mock provider), a script `pnpm bank-sync` triggers the same function.

### 6. Cutover with PDF imports

- `process-statement.ts` drops rows dated on or after an active connection's `sync_from` for that account.
  - It reports them in `detected.skippedBankSynced`, and the statement review shows "N rows already come from bank sync".
  - Balance checks then run on the remaining rows only. Alternatively, the statement is accepted when its period is fully after `sync_from` (decide during implementation).
- `sync_from` can't move earlier than the account's PDF coverage, so bank data never lands on dates users already reviewed.
- Once bank rows exist, `sync_from` can't be moved later either. To go back to PDFs, disconnect.
- Disconnecting keeps already-synced transactions. The account can then go back to PDF imports from the disconnect date.

### 7. Consent lifecycle

- **Expiry reminders** at 14 and 3 days before `valid_until`:
  - an email (a new React Email template in `src/emails`, sent with `sendEmail()`);
  - a banner on `/budgets`, `/dashboard` and Settings;
  - a count in Issues.
- **Reconnect** reuses the connect flow with the same bank, then swaps the session on the existing connection. Account links and `sync_from` are kept.
- **Disconnect, or deleting a user or household:** call `revokeSession`, then delete the connection rows. The encrypted ids go with them.

### 8. Budgets and UI touches

- `/budgets` shows "Updated 3 hours ago · Sync now" when any visible account is bank-synced.
- When a connection has expired, it shows "Bank data stale since …".
- The Accounts page shows a "Bank sync" badge, the bank's latest balance, and the date it was last updated.

### 9. Security and privacy

- Session ids and account uids are encrypted at rest (AES-GCM, `DATA_ENCRYPTION_KEY`). The private key only exists in environment variables.
- `state` is signed and short-lived, to prevent forged callbacks (CSRF).
- Logs record no transaction text.
- Add Enable Banking to the privacy notes and `SECURITY_PRIVACY_AUDIT.md` as a data processor.
- Data minimization: we request only accounts, balances and transactions.

### 10. Tests

- **Unit:**
  - mapping of Enable Banking transaction JSON (debit/credit, missing fields, non-EUR, `PDNG` skipped);
  - fingerprint stability across overlapping windows;
  - the `sync_from` cutover in the statement pipeline;
  - the minimum start date (after the latest statement period), and rejection of earlier dates by the server;
  - a sync never changes existing PDF rows: same category, flags, notes and transfer links before and after. Transfer matches with reviewed rows become suggestions only.
- **Integration (mock provider + PGlite):**
  - connect → map → initial sync → second sync inserts nothing new;
  - an excluded row stays excluded;
  - an expired session is marked `expired`;
  - RLS: another household can't read connections, and only the creator can revoke.

## Phases

0. **Spike (½–1 day).**
   - Create an Enable Banking account and register the app.
   - Link every household account in restricted mode.
   - For each of our banks, record:
     - consent length;
     - history depth on the first connection;
     - whether `entry_reference` is present;
     - description quality compared with the PDFs.
   - **Go/no-go per bank.** Banks that fail stay on PDF import.
1. **Foundations.** Provider interface, mock, Enable Banking client, migration plus RLS, `serviceModes` entry, and environment docs.
2. **Connect flow.** Settings page, callback, account mapping, `sync_from`.
3. **Sync engine.** Initial and incremental sync, categorization, transfers, balances, run log, cron route, and Sync now.
4. **Cutover.** Statement pipeline changes and review messaging.
5. **Lifecycle.** Reminders (email and banner), reconnect, disconnect, deletion.
6. **Polish.** "Updated X ago" on budgets and dashboard, account badges, i18n (en/es), loading skeletons, Storybook mocks, and docs (`PLAN.md`, `README.md`).

## Later (not in this plan)

- Pending transactions, shown and then replaced when they settle.
- Opening bank sync to other households: an Enable Banking commercial contract, KYB, terms and a privacy policy.
- Up to 4 syncs a day (needs a paid cron plan).
- Mixing PDF and bank rows on the same dates, with fuzzy matching. Reviewed PDF rows would still win; bank data would never overwrite them.
- A fallback provider (e.g. Afterbanks) for banks Enable Banking doesn't handle well.

## To verify during the spike

- The exact Enable Banking request and response fields (above, from public docs and memory). Whether webhooks exist; the plan assumes polling.
- How restricted mode handles each partner linking their own accounts under one app.
- Per-bank consent length (some Spanish banks may still use 90 days) and history depth.
