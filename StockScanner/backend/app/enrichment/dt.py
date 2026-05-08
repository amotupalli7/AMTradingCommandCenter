"""DilutionTracker scrape — delegates to TickerEnrich/dt_scraper.py.

We reuse a single persistent Chrome `BrowserSession` for every request to
amortize the ~3-5s spawn cost across tickers. Selenium calls are sync, so we
run them on a threadpool from async routes.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

# Add TickerEnrich to sys.path so we can import its scraper directly.
_TICKER_ENRICH_DIR = Path(__file__).resolve().parent.parent.parent.parent / "TickerEnrich"
if str(_TICKER_ENRICH_DIR) not in sys.path:
    sys.path.insert(0, str(_TICKER_ENRICH_DIR))

import dt_scraper  # noqa: E402

# Module-level singleton — Chrome process lives for the lifetime of the backend.
_session: dt_scraper.BrowserSession | None = None


def _get_session() -> dt_scraper.BrowserSession:
    global _session
    if _session is None:
        _session = dt_scraper.BrowserSession()
    return _session


def _scrape_sync(ticker: str) -> dict[str, Any]:
    raw = dt_scraper.scrape_dilution_tracker(ticker, session=_get_session())
    body_text = raw.get("body_text", "")
    parsed = dt_scraper.parse_dt_body(body_text)
    # Drop body_text from the response — it's huge and the parsed view is sufficient.
    return {
        "sector_line": parsed["sector_line"],
        "mktcap_line": parsed["mktcap_line"],
        "description": parsed["description"],
        "cash_position": parsed["cash_position"],
        "sections": parsed["sections"],
    }


async def scrape(ticker: str) -> dict[str, Any]:
    return await asyncio.to_thread(_scrape_sync, ticker)


def shutdown() -> None:
    global _session
    if _session is not None:
        try:
            _session.quit()
        except Exception:
            pass
        _session = None
