# StockScanner

Full-stack live scanner dashboard unifying `scanner_v2` (gap/runner alerts) and `TickerEnrich` (fundamentals) into one mobile-friendly web app.

## How to run

```bat
run_all.bat          # launches all three processes in separate windows
```

Or individually:
```bat
run_scanner.bat                  # scanner_v2 daemon
backend\run_dev.bat              # FastAPI backend  → http://127.0.0.1:8000
frontend\run_dev.bat             # Next.js frontend → http://127.0.0.1:3000
```

Health check: `GET /api/health`

## Architecture

```
scanner_v2/          # Python scanner daemon
  ingest.py          # Polygon websocket ingestion
  scanner.py         # gap/runner detection logic
  persistence.py     # writes scanner_data.json + candle storage
  candle_emitter.py  # builds live 1m bars from T.* trade stream
  models.py
  logs/scanner_data.json   # frontend reads this

backend/             # FastAPI (Python 3.11+, pyproject.toml)
  app/               # route handlers wrapping scanner_v2 + TickerEnrich logic

frontend/            # Next.js (React), Tailwind
  app/               # App Router pages
  components/        # UI components
  lib/               # API client, utils
```

## Stack

- **Frontend:** Next.js + React, Tailwind CSS, TradingView `lightweight-charts`
- **Backend:** FastAPI + uvicorn, `psycopg` (psycopg3), `pydantic-settings`
- **Scanner:** Python daemon reading Polygon.io websocket
- **DB:** `scanner_db` (separate Postgres DB from `trades_db`)

## UI layout (v1 spec)

- **Left rail** — Gap Scanner list, Intraday Scanner list, Alerts (HOD + backside bounce), top gainers, dilution feed, halts
- **Right** — up to 4 simultaneous chart panes, timeframes 1m/5m/15m/30m/1h/4h/daily
- **Bottom** — ticker enrichment panel (TickerEnrich tabs) when a ticker is selected

## Data sources

- **Polygon.io** — snapshot, aggs, trades websocket. Env var: `POLYGON_API_KEY` (also `apikey`)
- **DilutionTracker** — headless Chrome scrape, persistent shared session
- **SEC EDGAR** — `edgar` library
- **FMP** — symbol changes

## Key design decisions (locked 2026-05-07)

- Scanner stays a separate process; backend reads `scanner_data.json` — no direct coupling.
- Live 1m candles built from existing `T.*` trade websocket stream (no new `AM.*` subscription).
- Candle persistence: only for tickers that hit a scanner alert that day; others fetched on-demand from Polygon with short TTL cache.
- DT scrape uses persistent headless Chrome session (same pattern as TickerEnrich).
- Deployment: local Windows for now; mobile access via local IP / Tailscale.

## Reused code from TickerEnrich

- `TickerEnrich/dt_scraper.py`, `edgar_fetcher.py`, `ticker_data.py` — ported as FastAPI routes
- `TickerEnrich/` folder is git-ignored (was incorrectly tracked as a submodule, now removed)
