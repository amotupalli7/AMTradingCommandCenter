# AMTradingCommandCenter — Monorepo Overview

Active day trader (short-biased, small caps) automation suite. Multiple apps in one repo; each folder has its own CLAUDE.md with full context.

## Apps

| Folder | Stack | Purpose |
|--------|-------|---------|
| `TradeIngest/` | Python + Postgres | Ingests daily broker CSVs → `trades_db` |
| `TraderJournal/` | Next.js 16 + Postgres | Trade journal UI reading `trades_db` |
| `StockScanner/` | Next.js + FastAPI + Python | Live gap/runner scanner dashboard |
| `TradePlanner/` | React + Vite | Pre-market trade planning tool |
| `PlayBook/` | React + Vite | Playbook/strategy reference viewer |

## Shared infrastructure

- **Postgres** (`trades_db`, port 5432) — source of truth for all trade data. `TradeIngest` writes it, `TraderJournal` reads/writes it.
- **`scanner_db`** — separate Postgres DB for StockScanner candle persistence and ticker cache.
- **`.env` files** use `PG_` prefix (`PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DB`) — avoids collision with Windows env vars like `USERNAME`.
- **`data/`** — shared static reference data (e.g. `retracements.xlsx`).
- **External `Trading Statistics` folder** (outside repo) — daily broker CSV exports used by TradeIngest.

## Key conventions

- Each app has its own `.gitignore`; the root `.gitignore` only covers repo-level files.
- `TradeIngest/trades.db` and `.bak` are legacy SQLite files — no longer source of truth, Postgres is.
- `.bat` files at root (`StartPlaybook.bat`, `StartTraderJournal.bat`) launch apps quickly.
