# StockScanner backend

FastAPI service that backs the StockScanner web app. v1 responsibilities:
- read live state from `scanner_v2/logs/scanner_data.json` and broadcast via WebSocket
- store and serve 1m candles (Postgres `scanner_db`)
- expose ticker enrichment (DilutionTracker scrape, EDGAR filings, Polygon fundamentals)

## First-time setup

1. Copy env: `cp .env.example .env` and fill in `PG_PASSWORD` + `POLYGON_API_KEY`.
2. Install deps: `pip install -r requirements.txt`
3. Create the DB and apply schema: `python -m app.db.setup`
4. Boot the API: `uvicorn app.main:app --reload --port 8000`
5. Verify: `curl http://localhost:8000/api/health`
