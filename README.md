# Household Finance

A shared personal-finance app for two people. Drop the monthly PDF statements from all your banks; the app extracts every transaction, categorizes them, finds transfers between your own accounts, and shows where the money goes, for the household, the shared accounts, or each person.

See [PLAN.md](./PLAN.md) for the product plan and architecture.

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

On the login screen, click **Demo as Alex** (or **Sam**). This creates the household "Alex & Sam" with three accounts (one shared) and imports May–Sep 2026 sample statements. Go to **Import** and drop the October PDFs from `samples/` to watch the pipeline run.

You can also sign in with any email. The "magic link" is mocked and signs you in immediately. From there you create a household and invite your partner with a copyable link.

## Runs fully offline

Every external service sits behind an adapter. With no environment variables set, the app uses local mocks. **Settings → About** shows which mode each service is in.

| Service | Default (mock) | Real (set in `.env.local`) |
| --- | --- | --- |
| Database | Embedded PGlite in `.data/pglite` | `DATABASE_URL` (Postgres / Supabase) |
| PDF storage | Local disk `.data/uploads` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` |
| Parsing + categorization | Heuristic parser for Spanish bank layouts + keyword rules | `LLM_API_KEY` (+ `LLM_MODEL`, `LLM_BASE_URL` for any OpenAI-compatible API) |
| Auth | Signed-cookie session, instant "magic link" | Supabase Auth (planned) |
| Background jobs | In-process queue | Inngest (planned) |
| Bank logos | Coloured lettermarks | `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` ([Brandfetch Logo API](https://docs.brandfetch.com/logo-api/overview), free). Logos are embedded from Brandfetch's CDN as its terms require. Bank domains are in `src/lib/banks.ts`. |

Copy `.env.example` to `.env.local` to configure. Migrations in `drizzle/` run automatically on startup. Delete `.data/` to start from scratch.

In production, `AUTH_SECRET` is required and demo login is disabled unless `ENABLE_DEMO=1`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm test` | Vitest: domain logic, the full PDF → transactions pipeline, Postgres RLS policies |
| `pnpm typecheck` / `pnpm lint` | TypeScript / ESLint |
| `pnpm samples` | Regenerate the sample bank statements in `samples/` |
| `pnpm db:generate` | Generate a Drizzle migration after editing `src/lib/db/schema.ts` |

## How sharing works

- Each account has one or more **owners**, each with a share (50/50 by default for shared accounts). The per-person dashboard counts shared accounts at that person's share.
- Both partners see each other's accounts unless an account is marked **private**.
- Transfers between your own accounts are detected and excluded from income and spending.
- Category changes and rules apply to the whole household. Every edit is recorded in the transaction's history.

Authorization is enforced in the server layer (`src/lib/queries.ts`, `src/lib/actions/*`). `supabase/rls.sql` contains matching Row Level Security policies for when the database moves to Supabase. They are tested in `tests/rls.test.ts`.

## Languages and themes

The UI is available in **English and Spanish** ([next-intl](https://next-intl.dev)). The language comes from the `locale` cookie set by the language switch in the header, and falls back to the browser's `Accept-Language`. URLs don't change between languages. The light, dark and system themes use `next-themes`.

- Translations are in `messages/<locale>/<namespace>.json`. English is the source of truth, and keys are type-checked against it.
- Server errors are thrown as `UserError` codes (`src/lib/errors.ts`) and translated from `messages/*/errors.json`.
- Default category names are translated by slug (`src/lib/i18n/categories.ts`). Categories you rename are shown exactly as you typed them.
- To add a language: add it to `LOCALES` in `src/i18n/config.ts` and copy `messages/en/` to `messages/<locale>/`, then translate. `tests/i18n.test.ts` fails if any key or placeholder is missing.

## Project layout

```
src/app/            routes: (app)/dashboard, import, transactions, statements/[id], issues, accounts, settings
src/components/     UI (shadcn/ui), charts (TradingView Lightweight Charts™), shell, feature components
src/lib/db/         Drizzle schema, DB adapter (PGlite/Postgres), seeds
src/lib/pipeline/   upload → extract text → parse → dedupe → categorize → detect transfers
src/lib/services/   storage, LLM and job-queue adapters (mock + real)
src/lib/actions/    server actions (all mutations)
src/lib/queries.ts  read models (dashboard, issues, transactions, completeness)
src/i18n/, messages/ locale config and en/es translations
samples/            generated sample statements for 3 accounts, May–Oct 2026
```

Charts use [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/) (Apache-2.0). The attribution logo is kept on the charts as the license requires.
