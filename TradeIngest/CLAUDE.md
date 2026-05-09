# TradeIngest

Python pipeline that ingests daily broker CSV exports into Postgres (`trades_db`). Source of truth for all trade data consumed by TraderJournal.

## How to run

```bash
# First-time setup (idempotent — safe to re-run)
python db_setup.py

# Ingest all available days
python ingest_trades.py --all

# Ingest a specific day
python ingest_trades.py 3-27-26

# Re-ingest a day (force overwrite)
python ingest_trades.py 3-27-26 --force

# Load consolidated locates file
python ingest_trades.py --locates
```

## Database

- **DB name:** `trades_db` | **Port:** 5432 | **User:** `postgres`
- Connection config in `.env` using `PG_HOST` / `PG_PORT` / `PG_USER` / `PG_PASSWORD` / `PG_DB`
- Use `psycopg2` for all DB access

## Tables

| Table | Description |
|-------|-------------|
| `raw_executions` | Every fill from daily CSV. Unique on `(date, time, symbol, side, price, qty, route)` |
| `trades` | Consolidated position open→flat. `date` = entry date. Unique on `(date, symbol, trade_index)` |
| `trade_executions` | Many-to-many link between raw_executions and trades |
| `daily_fees` | Broker AR file data per `(date, symbol)` |
| `locates` | Borrowed-share locates — may include unused locates (still cost money) |

## Key invariants

- A trade closes when running position returns to zero.
- **Cross-day stitching:** if prior day left an open position, today's executions attach to that prior trade (UPDATE in place, keep same `id`); gross/net P&L recomputed across both days.
- Commission = $0.0025 × all shares traded across all days of the trade.
- ECN/SEC/FINRA/HTB/CAT fees come from the AR file, split proportionally by shares traded that day.
- AR cross-check warning suppressed on swing days (carry-in or unclosed-out) — broker AR includes MTM on open positions which won't match.

## Input files (from external `Trading Statistics` folder)

- `M-D-YY.csv` — raw executions
- `M-D-YY_AR.csv` — broker account report with fees
- `locates.csv` — consolidated all-time locates (fallback: `TradeIngest/SPTD 2026/locates.csv`)

## Journal migration (in progress)

`trade_journal` and `daily_account` tables are being added to hold manual journaling data currently in `trades.xlsx`. See the monorepo CLAUDE.md and `db_setup.py` for schema details. Key points:
- `legacy_trade_id` links to old Excel Trade IDs — never overwrite these.
- `v_trades_full` view computes derived columns (`~Pos Size`, `Acc %`, `Risk %`, `R Net`, etc.) on read.
- `$ Risk` is imported as-is from xlsx col 24 — do not back-compute from account_value × risk%.

## Notes

- `trades.db` / `trades.db.bak` — legacy SQLite files, no longer source of truth, keep but ignore.
- `trades.xlsx` — source for the one-time journal import; goes stale after cutover but is not deleted.
