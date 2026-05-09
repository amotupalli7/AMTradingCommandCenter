# TraderJournal

Next.js 16 trade journal UI. Reads and writes `trades_db` (Postgres). App lives in `trader-journal/` subfolder.

## How to run

```bash
cd trader-journal
npm run dev       # http://localhost:3000
npm run build
npm run start
```

## Stack

- **Next.js 16** (App Router), React 19, TypeScript
- **Tailwind CSS v4** + shadcn/ui (Radix UI)
- **`pg`** (node-postgres) for DB access — uses `PG_*` env vars
- **`recharts`** for chart visualizations
- **`swr`** for data fetching/caching

## Key src layout

```
trader-journal/src/
  app/          # Next.js App Router pages
  components/   # UI components
  context/      # React context providers
  hooks/        # Custom hooks
  lib/          # DB queries, utilities
```

## Database connection

Uses `PG_HOST` / `PG_PORT` / `PG_USER` / `PG_PASSWORD` / `PG_DB` from `.env`. Queries `trades_db` on port 5432.

## Journal migration context

Manual journaling fields are being migrated from `trades.xlsx` into Postgres. Phased plan:
1. Schema — `legacy_trade_id` on `trades`, new `trade_journal` + `daily_account` tables, `v_trades_full` view
2. One-time import from xlsx (match on `date, symbol, entry_time`)
3. Update `ingest_trades.py` to create empty `trade_journal` row per new trade
4. Replace `lib/excel.ts` with `lib/db.ts` (same exported function signatures)
5. UI — 8 X-flag checkboxes, Win override toggle, `$ Risk` input, Setup/Sub-Setup inputs, new `/daily` page
6. Cutover — xlsx stays but goes stale

**Key gotcha:** `legacy_trade_id` (from Excel) ≠ Postgres `trades.id` — always join via `legacy_trade_id`.

## Shared data

- `trades_db` Postgres — written by `TradeIngest/`, read/written here
- `chart-paths.json` — cached chart image paths
- `chart-cache/` — cached chart images
- `trades_db/` — may contain local migration scripts
