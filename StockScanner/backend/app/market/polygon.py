"""Thin async wrapper around the Polygon REST client used for backfill.

The `massive` library is sync; we run its calls in a threadpool. We deliberately do
*not* depend on the scanner_v2 package here — both bits of code happen to use the
same vendor SDK but they have different processes and different lifecycles.
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from typing import Iterable

from massive import RESTClient

from ..config import settings


def _client() -> RESTClient:
    if not settings.POLYGON_API_KEY:
        raise RuntimeError("POLYGON_API_KEY is not configured in backend/.env")
    return RESTClient(settings.POLYGON_API_KEY)


def _to_unix_ms(d: date | datetime | int) -> int:
    if isinstance(d, int):
        return d
    if isinstance(d, datetime):
        dt = d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp() * 1000)


def fetch_minute_aggs_sync(ticker: str, from_ms: int, to_ms: int) -> list[dict]:
    """Pull 1-minute aggregates from Polygon for [from_ms, to_ms]. Returns OHLCV dicts."""
    client = _client()
    out: list[dict] = []
    # list_aggs paginates automatically; cap limit per page at 50000 (Polygon max)
    for agg in client.list_aggs(
        ticker=ticker,
        multiplier=1,
        timespan="minute",
        from_=from_ms,
        to=to_ms,
        limit=50000,
    ):
        ts = getattr(agg, "timestamp", None)
        o = getattr(agg, "open", None)
        h = getattr(agg, "high", None)
        l = getattr(agg, "low", None)
        c = getattr(agg, "close", None)
        v = getattr(agg, "volume", None) or 0
        if ts is None or o is None or h is None or l is None or c is None:
            continue
        out.append({"ts_ms": int(ts), "open": float(o), "high": float(h),
                    "low": float(l), "close": float(c), "volume": int(v)})
    return out


def fetch_daily_aggs_sync(ticker: str, from_date: date, to_date: date) -> list[dict]:
    client = _client()
    out: list[dict] = []
    for agg in client.list_aggs(
        ticker=ticker,
        multiplier=1,
        timespan="day",
        from_=from_date,
        to=to_date,
        limit=50000,
        adjusted=True,
    ):
        ts = getattr(agg, "timestamp", None)
        o = getattr(agg, "open", None)
        h = getattr(agg, "high", None)
        l = getattr(agg, "low", None)
        c = getattr(agg, "close", None)
        v = getattr(agg, "volume", None) or 0
        if ts is None or o is None:
            continue
        d = datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc).date()
        out.append({"date": d.isoformat(), "open": float(o), "high": float(h),
                    "low": float(l), "close": float(c), "volume": int(v)})
    return out


async def fetch_minute_aggs(ticker: str, from_ms: int, to_ms: int) -> list[dict]:
    return await asyncio.to_thread(fetch_minute_aggs_sync, ticker, from_ms, to_ms)


async def fetch_daily_aggs(ticker: str, from_date: date, to_date: date) -> list[dict]:
    return await asyncio.to_thread(fetch_daily_aggs_sync, ticker, from_date, to_date)
