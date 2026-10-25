# Personal Finance — Project Plan

## 1. Goal

A collaborative web app where my partner and I can:

- Register all our bank accounts across multiple banks (personal and shared).
- Upload monthly bank statements in **PDF** format from any bank.
- Automatically extract and **categorize** every transaction.
- See a **dashboard** with spending, income, balances and trends, per person, per account and for the household as a whole.

## 2. Core concepts

| Concept | Description |
|---|---|
| **User** | A person who logs in (me, my partner). |
| **Household** | A shared space. Both users are members. All data belongs to a household. |
| **Bank** | An institution (ING, BBVA, Santander, Revolut…). |
| **Account** | A bank account (IBAN, currency, type). Has one or more **owners**. |
| **Account owner** | Links an account to users, so an account can be *personal* (one owner) or *shared* (several owners), optionally with an ownership split (e.g. 50/50). |
| **Statement** | One uploaded PDF for one account and one period (month). |
| **Transaction** | A single movement parsed from a statement (date, description, amount, balance). |
| **Category / Subcategory** | Hierarchical classification (e.g. Home → Rent). Household-specific, with seeded defaults. |
| **Categorization rule** | "If description/merchant matches X, assign category Y." Learned from corrections. |

### Sharing semantics

- Every member of a household can see all **shared** accounts and their transactions.
- **Personal** accounts are visible to the household by default (configurable later: "private" flag).
- Dashboards can be filtered by: *Me*, *Partner*, *Shared*, *Everything*.
- For shared accounts, per-person views apply the ownership split (e.g. a €100 shared expense counts as €50 each).
- Transfers between our own accounts are detected and excluded from income/expense totals.

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | One language end-to-end. |
| Framework | **Next.js 15 (App Router)** | UI, server actions and API routes in one app. |
| UI | **Tailwind CSS + shadcn/ui** | Fast, accessible, owned components. |
| Charts | **TradingView Lightweight Charts v5** (`lightweight-charts`) | Tiny, fast, canvas-based time-series charts with crosshair, zoom and pan. See §8.1. |
| Forms / validation | **React Hook Form + Zod** | Shared schemas client/server and for LLM output. |
| Data fetching | **TanStack Query** + server actions | Caching and optimistic updates. |
| Database | **Supabase Postgres** | Managed Postgres with Row Level Security. |
| ORM / migrations | **Drizzle ORM** + drizzle-kit | Typed queries, SQL-first migrations. |
| Auth | **Supabase Auth** (email magic link + Google) | Works natively with RLS. |
| File storage | **Supabase Storage** (private bucket) | Stores original PDFs. |
| PDF text extraction | **unpdf / pdfjs-dist** | Text-based PDFs (most bank statements). |
| OCR fallback | **AWS Textract** or **Google Document AI** | Only for scanned PDFs (phase 2+). |
| Transaction extraction | **LLM with structured output** (OpenAI or Anthropic) + Zod schema | One generic parser instead of one per bank. |
| Background jobs | **Inngest** | Reliable async parsing pipeline with retries. |
| Money | Integer minor units (cents) + **Dinero.js** | No floating point errors. |
| Testing | **Vitest** (unit), **Playwright** (e2e) | |
| Lint / format | **ESLint + Prettier** | |
| Hosting | **Vercel** (app) + **Supabase** (DB/auth/storage) | Zero-ops. |
| Monitoring | **Sentry** | Errors in parsing pipeline. |
| Package manager | **pnpm** | |

## 4. Architecture

```
┌──────────────┐   upload PDF    ┌──────────────────┐
│  Next.js UI  │ ──────────────▶ │ Supabase Storage │
│ (dashboard)  │                 └────────┬─────────┘
└──────┬───────┘                          │
       │ create statement row             │
       ▼                                  ▼
┌──────────────┐  event "statement.uploaded"  ┌──────────────────────────┐
│ Server action│ ───────────────────────────▶ │ Inngest parsing pipeline │
└──────────────┘                              │ 1. extract text          │
                                              │ 2. redact sensitive data │
                                              │ 3. LLM → JSON (Zod)      │
                                              │ 4. validate balances     │
                                              │ 5. dedupe                │
                                              │ 6. categorize            │
                                              │ 7. status = needs_review │
                                              └────────────┬─────────────┘
                                                           ▼
                                              ┌──────────────────────────┐
                                              │ Supabase Postgres (+RLS) │
                                              └──────────────────────────┘
```

### Code structure (feature-based, light DDD)

```
src/
  app/                 # Next.js routes (dashboard, accounts, statements, settings)
  components/          # shared UI (shadcn)
  features/
    households/
    accounts/
    statements/        # upload, parsing pipeline, review
    transactions/
    categorization/    # rules engine + LLM fallback
    dashboard/
  lib/
    db/                # drizzle schema, client, migrations
    supabase/          # auth & storage clients
    money/             # money value object
    llm/               # provider abstraction
  inngest/             # background functions
tests/
```

## 5. Data model (initial)

```
users (managed by Supabase Auth) + profiles(id, display_name, avatar_url)

households(id, name, base_currency, created_at)
household_members(household_id, user_id, role[owner|member], joined_at)
household_invites(id, household_id, email, token, expires_at, accepted_at)

banks(id, name, country, logo_url)                       -- seeded
accounts(id, household_id, bank_id, name, iban_last4, iban_hash,
         currency, type[checking|savings|credit|investment],
         is_private, archived_at, created_at)
account_owners(account_id, user_id, share_pct)           -- share_pct sums to 100

statements(id, account_id, uploaded_by, file_path, file_sha256,
           period_start, period_end, opening_balance, closing_balance,
           status[uploaded|processing|needs_review|confirmed|failed],
           error, parser_version, created_at)

transactions(id, account_id, statement_id, booked_at, value_date,
             description_raw, merchant, amount_cents, currency,
             balance_after_cents, category_id, categorized_by[rule|llm|user],
             transfer_group_id, notes, fingerprint, created_at)

categories(id, household_id, parent_id, name, kind[expense|income|transfer], icon, color)
category_rules(id, household_id, match_type[contains|regex|merchant],
               pattern, category_id, priority, created_by, hits)
transaction_changes(id, transaction_id, user_id, field, old_value, new_value, created_at)  -- audit trail
```

- `fingerprint` = hash(account, date, amount, normalized description, ordinal), used to avoid duplicates when statements overlap.
- `file_sha256` prevents uploading the same PDF twice.
- **RLS**: every table is readable/writable only if `auth.uid()` is a member of the row's household; private accounts are restricted to their owners.

## 6. Statement parsing pipeline

1. **Upload**: user selects account (or auto-detect from PDF later) and drops one or many PDFs.
2. **Extract text** with `unpdf`. If almost no text, mark as scanned → OCR (phase 2+).
3. **Redact**: mask full IBANs / card numbers / personal ID numbers before sending to the LLM.
4. **LLM extraction**: prompt + Zod schema →
   `{ period, openingBalance, closingBalance, currency, transactions[] }`.
   Large statements are chunked by page.
5. **Validation**: `opening + Σ amounts == closing` (and running balances if present). If mismatch → flag for review.
6. **Dedupe** via fingerprints.
7. **Categorize** (see below).
8. **Review screen**: user sees parsed rows, fixes anything, confirms → `confirmed`.

Optional optimisation later: bank-specific deterministic parsers (regex/table) for the most common banks, with LLM as fallback. Also accept CSV/XLS exports.

## 7. Categorization

Order of precedence:

1. **User rules** (household `category_rules`, by priority).
2. **Merchant memory**: same normalized merchant previously categorized by the user.
3. **LLM fallback**: batch unknown descriptions with the category list; returns category + confidence.
4. Low confidence → `Uncategorized`, highlighted in review.

When a user re-categorizes a transaction, offer "Apply to all similar & create rule".

**Transfers** between own accounts: match opposite amounts within ±3 days across household accounts → link with `transfer_group_id` and categorize as Transfer.

Seed categories (editable): Housing, Utilities, Groceries, Restaurants, Transport, Car, Health, Sports, Education, Shopping, Leisure & Travel, Subscriptions, Insurance, Taxes, Kids, Pets, Gifts, Salary, Other income, Savings/Investments, Transfers, Uncategorized.

## 8. UX principles (inspired by Summ)

[Summ](https://summ.com/es) (formerly Crypto Tax Calculator) is a crypto tax tool. Its domain differs from ours, but its UX solves the same problem: turning messy imports from many sources into clean, categorized data. We borrow these patterns:

1. **"Add account" as the entry point.** A searchable bank picker with logos ("Add account → search *ING* → nickname → owners"). If a bank isn't known yet, allow a generic "Other bank" option instead of blocking.
2. **One import flow, many sources.** Drag & drop any number of PDFs at once. The app detects the bank, account and period, and only asks when unsure. CSV/XLS is offered as the fallback, like Summ's Custom CSV.
3. **Automate first, flag the rest.** Auto-categorize everything, but never silently guess. Low-confidence items are flagged instead of hidden.
4. **Issues counter.** A persistent badge ("7 items need attention") showing uncategorized transactions, balance mismatches, missing months, unmatched transfers and failed parses. Clicking it opens a filtered list, and each issue links to its source transaction or statement.
5. **Suggestions, not chores.** Show actions such as "These 2 movements look like a transfer between your accounts — link them?" and "12 similar transactions from *Mercadona* — categorize all as Groceries?" with one-click accept.
6. **Bulk actions and retroactive rules.** Multi-select to recategorize, and "create rule from this", which applies to past and future transactions.
7. **Completeness view.** A grid of accounts × months showing which statements are imported, missing or need review, so it's obvious what to upload next.
8. **Traceability.** Every transaction links back to its statement PDF page. Category changes keep a history (who changed what — useful with two users).
9. **Calm, minimal screens.** Few steps, clear empty states with a single primary action, and progress feedback during parsing.

### 8.1 Charts with Lightweight Charts

Lightweight Charts is built for **time-series** data. It supports Line, Area, Baseline, Histogram, Bar and Candlestick series, plus panes, markers, crosshair, zoom and pan. It has **no pie or donut charts and no categorical axes**.

| Dashboard element | Implementation |
|---|---|
| Net worth / total balance over time | `AreaSeries` |
| Balance per account over time | One `LineSeries` per account, toggled from a legend |
| Monthly income vs expenses | Two `HistogramSeries` (green/red) |
| Monthly net savings (above/below zero) | `BaselineSeries` with baseline 0 |
| Category spending trend over time | `LineSeries` per selected category |
| Notable events (salary, big purchase) | `createSeriesMarkers` on the balance chart |
| Spending **by category** (share of total) | **Not a chart:** ranked horizontal bars built with Tailwind (category, amount, % bar, Δ vs last month). This is easier to read than a donut and needs no extra library. |

Implementation notes:
- Wrap it in a client-only React component (`'use client'`, created in `useEffect` and disposed with `chart.remove()`), with a `ResizeObserver` for responsiveness and theme-aware colors (light/dark).
- Use the v5 API (`chart.addSeries(LineSeries, …)`, `createSeriesMarkers`). Data times use `'YYYY-MM-DD'` strings, must be ascending and unique, and are aggregated per day or month on the server.
- Show money in a custom `priceFormatter` (€ with locale), not raw numbers.
- **License (Apache-2.0):** we must show TradingView attribution. Keep the `attributionLogo` chart option enabled and add the NOTICE text and a link to tradingview.com on an "About" page.

## 9. Features & screens

- **Auth & onboarding**: sign up, create household, invite partner by email. Then a 3-step guided setup: add accounts → upload first statements → review.
- **Accounts**: "Add account" searchable bank picker; nickname, owners and share %; archive.
- **Import**: drag & drop multiple PDFs anywhere in the app; auto-detection of account and period; live status per file (uploading → reading → categorizing → ready for review).
- **Completeness**: accounts × months grid (imported / missing / needs review).
- **Review**: editable table of parsed transactions, with flagged rows first; bulk accept; confirm.
- **Issues & suggestions**: global counter in the header, plus a dedicated inbox page with one-click fixes.
- **Transactions**: searchable/filterable table (date, account, owner, category, amount); multi-select bulk actions; notes; link to source PDF.
- **Categories & rules**: manage categories and rules; "apply retroactively" preview.
- **Dashboard**:
  - Filter: period, *Me / Partner / Shared / All*, accounts.
  - KPIs: income, expenses, net savings, savings rate, with Δ vs previous period.
  - Lightweight Charts: net worth (area), income vs expenses (histograms), net savings (baseline), balance per account (lines).
  - Category breakdown as ranked bars; top merchants; biggest transactions.
- **Settings**: household, members, base currency, about/attributions.

## 10. Privacy & security

- RLS on every table; service role key only on server/background jobs.
- Private storage bucket; signed URLs with short expiry.
- Redact identifiers before LLM calls; use an LLM provider with zero data retention, or a local model (Ollama) option.
- Store only IBAN last 4 + hash.
- Option to delete original PDFs after confirmation.
- Secrets only in environment variables; `.env.example` committed.

## 11. Roadmap

### Phase 0 — Setup
- Scaffold Next.js + TS + Tailwind + shadcn, ESLint/Prettier, Vitest, Playwright.
- Supabase project, Drizzle schema & first migration, RLS policies.
- CI (GitHub Actions): lint, typecheck, test.

### Phase 1 — Foundations
- Auth, household creation, partner invitation, guided onboarding.
- Banks seed (with logos), "Add account" searchable picker, owners/shares.

### Phase 2 — Statement ingestion (MVP core)
- Multi-file drag & drop upload, statement records, dedupe by hash.
- Inngest pipeline: text extraction → LLM extraction → validation, with live status per file.
- Auto-detection of account and period.
- Review & confirm screen (flagged rows first), completeness grid.
- Test with real statements from each of our banks.

### Phase 3 — Categorization
- Seed categories, rules engine, merchant memory, LLM fallback.
- Bulk actions, "create rule" with retroactive preview, transfer detection.
- Issues counter + suggestions inbox.

### Phase 4 — Dashboard
- KPIs, filters (Me/Partner/Shared/All), transactions table.
- Reusable Lightweight Charts React wrapper; net worth, income vs expenses, net savings, balance per account; category ranked bars; TradingView attribution.

### Phase 5 — Nice to have
- OCR for scanned PDFs, CSV/XLS import, deterministic parsers per bank.
- Budgets & alerts, recurring payment detection, multi-currency conversion.
- Settle-up between partners for shared expenses.
- PWA/mobile-friendly upload, export to CSV.

## 12. Testing strategy

- Unit: money, fingerprints, balance validation, rules engine, transfer matching.
- Parsing: fixture PDFs (anonymized) per bank with expected JSON snapshots.
- RLS: tests ensuring a user cannot read another household's data.
- E2E: sign up → create account → upload PDF → review → see dashboard.

## 13. Open questions

1. Which banks (and countries) do we use? Are statements text-based PDFs or scanned?
2. Language of the UI and categories (English / Spanish / both)?
3. Single currency (EUR) or multiple?
4. Should personal accounts be visible to the partner by default?
5. LLM provider preference (OpenAI, Anthropic, local Ollama)? Budget constraints?
6. Hosting: Vercel + Supabase cloud OK, or self-hosted?
7. Do we need a mobile app, or is a responsive web app enough?

## 14. Implementation notes (v0)

What was built differs from the plan above in a few deliberate ways:

- **Next.js 16** (current stable) instead of 15. Mutations use server actions plus `router.refresh()`; TanStack Query, React Hook Form and Dinero.js were not needed yet. Money is integer cents with `Intl` formatting.
- **Every external service is an adapter with a local mock as the default**, so the app runs offline with zero setup:
  - DB: embedded PGlite, or Postgres via `DATABASE_URL`.
  - Storage: local disk, or Supabase Storage.
  - Parsing and categorization: a heuristic parser, or any OpenAI-compatible LLM.
  - Jobs: an in-process queue (Inngest later).
  - Auth: a signed-cookie session with an instant "magic link"; invites are shared as links instead of emails.
- **Authorization lives in the server layer** (every query is scoped by household and visible accounts). `supabase/rls.sql` holds the equivalent RLS policies, tested on PGlite, for when the DB moves to Supabase.
- Assumed answers to §13 until confirmed: English and Spanish UI (next-intl, cookie-based locale, no URL prefix), light/dark/system theme, EUR only, Spanish banks with text-based PDFs, personal accounts visible to the partner unless marked private.
- Not built yet: OCR, Sentry, Google login, real email sending, settle-up, budgets.
