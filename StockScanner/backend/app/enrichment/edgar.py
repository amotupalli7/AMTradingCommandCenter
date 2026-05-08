"""Thin wrapper around TickerEnrich/edgar_fetcher.py — adds it to sys.path so we
don't have to fork or duplicate the EDGAR scraping code, and exposes async
helpers that run the (sync, network-heavy) calls in a threadpool."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# Make TickerEnrich importable. It's a sibling folder under StockScanner/.
_TICKER_ENRICH_DIR = Path(__file__).resolve().parent.parent.parent.parent / "TickerEnrich"
if str(_TICKER_ENRICH_DIR) not in sys.path:
    sys.path.insert(0, str(_TICKER_ENRICH_DIR))

# `edgar` library wants an EMAIL_FOR_EDGAR env var to identify the requester.
# TickerEnrich's .env has it under that name; surface it so edgar lib can find it.
_TICKER_ENV = _TICKER_ENRICH_DIR / ".env"
if _TICKER_ENV.exists():
    for line in _TICKER_ENV.read_text(encoding="utf-8").splitlines():
        if "=" not in line or line.startswith("#"):
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())

import edgar as _edgar_lib  # noqa: E402
import edgar_fetcher  # noqa: E402

# SEC requires a User-Agent identity on every EDGAR request. The `edgar` library
# stores it globally; set once at module load.
_email = os.environ.get("EMAIL_FOR_EDGAR")
if _email:
    _edgar_lib.set_identity(_email)


async def fetch_filings(ticker: str) -> dict:
    return await asyncio.to_thread(edgar_fetcher.fetch_edgar_filings, ticker)


async def fetch_ownership(ticker: str) -> dict:
    return await asyncio.to_thread(edgar_fetcher.fetch_ownership_filings, ticker)
