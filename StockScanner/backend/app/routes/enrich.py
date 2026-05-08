"""Ticker enrichment routes.

Three endpoints (the panel calls all three when a ticker is selected):
  GET /api/enrich/{ticker}/edgar   — SEC filings + ownership + ticker rename. Fast (~1s).
  GET /api/enrich/{ticker}/dt      — DilutionTracker scrape. Slow (~3-5s, headless Chrome).

We split DT off because it's slow and unreliable; the EDGAR side should fill in
immediately while DT spins.

The combined payload is also cached per (ticker, date) in `enrichment_cache`.
"""
import asyncio
from datetime import date

from fastapi import APIRouter, HTTPException

from ..enrichment import cache, dt, edgar, rename

router = APIRouter(prefix="/api/enrich", tags=["enrich"])


@router.get("/{ticker}/edgar")
async def get_edgar(ticker: str, refresh: bool = False) -> dict:
    """Fast bundle: SEC filings, ownership, ticker rename. Cached per-day."""
    ticker = ticker.upper()
    today = date.today()

    if not refresh:
        cached = await cache.read(ticker, today)
        if cached is not None and "filings" in cached:
            return cached

    filings, ownership = await asyncio.gather(
        edgar.fetch_filings(ticker),
        edgar.fetch_ownership(ticker),
        return_exceptions=True,
    )
    payload = {
        "ticker": ticker,
        "date": today.isoformat(),
        "previously": rename.lookup(ticker),
        "filings": filings if not isinstance(filings, BaseException) else {"groups": [], "error": str(filings)},
        "ownership": ownership if not isinstance(ownership, BaseException) else {"filings": [], "error": str(ownership)},
    }
    await cache.write(ticker, today, payload)
    return payload


@router.get("/{ticker}/dt")
async def get_dt(ticker: str) -> dict:
    """DilutionTracker scrape. Not cached (Selenium handle reused, scrape fast on cache hit)."""
    ticker = ticker.upper()
    try:
        return await dt.scrape(ticker)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
