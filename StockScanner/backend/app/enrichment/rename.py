"""Ticker-rename lookup via FMP's symbol-change endpoint.

The full list is small (~couple thousand changes) and rarely updated, so we fetch
once at backend startup and cache in-process. Subsequent lookups are dict access.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

# Reuse TickerEnrich's .env so the FMP key isn't duplicated.
_TICKER_ENRICH_DIR = Path(__file__).resolve().parent.parent.parent.parent / "TickerEnrich"
_TICKER_ENV = _TICKER_ENRICH_DIR / ".env"
if _TICKER_ENV.exists():
    for line in _TICKER_ENV.read_text(encoding="utf-8").splitlines():
        if "=" not in line or line.startswith("#"):
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


_db: dict[str, dict] = {}
_loaded = False


def _refresh_sync() -> dict[str, dict]:
    api_key = os.getenv("FMP_APIKEY", "")
    if not api_key:
        logger.warning("FMP_APIKEY missing; ticker-rename lookup disabled")
        return {}
    url = f"https://financialmodelingprep.com/stable/symbol-change?apikey={api_key}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logger.warning("FMP symbol-change fetch failed: %s", e)
        return {}

    db: dict[str, dict] = {}
    for entry in data:
        new = (entry.get("newSymbol") or "").upper()
        old = (entry.get("oldSymbol") or "").upper()
        if new and old:
            db[new] = {
                "old_symbol": old,
                "date": entry.get("dateChanged") or entry.get("date") or "",
                "name": entry.get("name") or "",
            }
    return db


async def init() -> None:
    """Call once on app startup. No-op on subsequent calls."""
    global _db, _loaded
    if _loaded:
        return
    _loaded = True
    _db = await asyncio.to_thread(_refresh_sync)
    logger.info("ticker-rename db loaded: %d entries", len(_db))


def lookup(ticker: str) -> dict | None:
    return _db.get(ticker.upper())
