"""Candle store: read-through cache backed by Postgres.

Read flow for intraday timeframes:
  1. Caller asks for `(ticker, from_ms, to_ms, tf)`.
  2. We check `candles_1m` for coverage in that window. If we have at least one bar
     in the window we trust the DB — scanner_v2's emitter writes to it whenever the
     ticker is promoted, and a missing minute is just a quiet minute.
  3. If we have *zero* bars in the window we backfill from Polygon REST and insert
     into `candles_1m`.
  4. We aggregate 1m → requested TF in SQL via date_trunc / time bucketing.

Daily timeframe is the same idea against `candles_daily`.

This avoids duplicating data the scanner emitter already writes, while letting the
chart UI work for tickers the scanner has never seen (the user types AAPL into a
chart pane).
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone

import psycopg

from ..db.session import connect
from . import polygon

# Allowed intraday timeframes and their bucket size in seconds.
INTRADAY_TF_SECONDS: dict[str, int] = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
}


def _bucket_seconds(tf: str) -> int:
    if tf not in INTRADAY_TF_SECONDS:
        raise ValueError(f"unsupported intraday tf: {tf}")
    return INTRADAY_TF_SECONDS[tf]


def _ts_range_in_window(ticker: str, from_ms: int, to_ms: int) -> tuple[int | None, int | None]:
    """Min/max bar timestamps we have for this ticker in [from_ms, to_ms), as unix ms."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT EXTRACT(EPOCH FROM MIN(ts))::bigint * 1000 AS min_ms, "
            "       EXTRACT(EPOCH FROM MAX(ts))::bigint * 1000 AS max_ms "
            "FROM candles_1m WHERE ticker = %s AND ts >= to_timestamp(%s/1000.0) "
            "AND ts < to_timestamp(%s/1000.0)",
            (ticker, from_ms, to_ms),
        )
        row = cur.fetchone()
        if row is None:
            return (None, None)
        return (row.get("min_ms"), row.get("max_ms"))


def _insert_minute_bars(ticker: str, bars: list[dict]) -> int:
    """Bulk upsert minute bars from Polygon REST.

    On conflict we *overwrite* with Polygon's values, not max-merge. Polygon REST is
    the authority — if a WS-built row had wrong O/H/L/V (sparse-ticker problem,
    missed prints, etc.), the REST row replaces it entirely. Volume from Polygon
    REST is the cumulative count for the minute, so overwriting is correct.

    This is also called from live_hub on minute-rollover to retroactively correct
    finalized bars, so it has to be idempotent and authoritative.
    """
    if not bars:
        return 0
    sql = """
    INSERT INTO candles_1m (ticker, ts, open, high, low, close, volume)
    VALUES (%s, to_timestamp(%s/1000.0), %s, %s, %s, %s, %s)
    ON CONFLICT (ticker, ts) DO UPDATE SET
        open   = EXCLUDED.open,
        high   = EXCLUDED.high,
        low    = EXCLUDED.low,
        close  = EXCLUDED.close,
        volume = EXCLUDED.volume
    """
    rows = [(ticker, b["ts_ms"], b["open"], b["high"], b["low"], b["close"], b["volume"]) for b in bars]
    with connect() as conn, conn.cursor() as cur:
        cur.executemany(sql, rows)
        conn.commit()
    return len(rows)


async def correct_finalized_minute(ticker: str, minute_start_ms: int) -> None:
    """Overwrite the DB row for a single just-finalized minute with Polygon's truth.

    Called by live_hub when a minute rolls over. Polygon's REST minute aggregate is
    typically available within a second of minute close, so by the time the next
    minute's WS tick fires we can correct the previous minute permanently.
    """
    bars = await polygon.fetch_minute_aggs(ticker, minute_start_ms, minute_start_ms + 60_000)
    if not bars:
        return
    # Filter to exactly the requested minute — Polygon may also include adjacent ones.
    target = [b for b in bars if (int(b["ts_ms"]) // 60_000) == (minute_start_ms // 60_000)]
    if target:
        await asyncio.to_thread(_insert_minute_bars, ticker, target)


def _insert_daily_bars(ticker: str, bars: list[dict]) -> int:
    if not bars:
        return 0
    sql = """
    INSERT INTO candles_daily (ticker, date, open, high, low, close, volume)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (ticker, date) DO UPDATE SET
        open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
        close = EXCLUDED.close, volume = EXCLUDED.volume
    """
    rows = [(ticker, b["date"], b["open"], b["high"], b["low"], b["close"], b["volume"]) for b in bars]
    with connect() as conn, conn.cursor() as cur:
        cur.executemany(sql, rows)
        conn.commit()
    return len(rows)


def _query_intraday(ticker: str, from_ms: int, to_ms: int, tf: str) -> list[dict]:
    """Aggregate 1m bars into the requested tf bucket. Bucketing uses
    `floor(epoch / N) * N` so bucket boundaries are stable regardless of when the
    query runs.

    For OHLC we use first_value / last_value over the bucket — `MIN/MAX` would be
    wrong for open/close because those are time-ordered, not numeric extremes.
    """
    bucket = _bucket_seconds(tf)
    sql = """
    WITH bucketed AS (
        SELECT
            (FLOOR(EXTRACT(EPOCH FROM ts) / %(bucket)s)::bigint) * %(bucket)s AS bucket_epoch,
            ts, open, high, low, close, volume
        FROM candles_1m
        WHERE ticker = %(ticker)s
          AND ts >= to_timestamp(%(from_ms)s / 1000.0)
          AND ts <  to_timestamp(%(to_ms)s   / 1000.0)
    )
    SELECT
        bucket_epoch * 1000 AS ts_ms,
        (ARRAY_AGG(open  ORDER BY ts ASC ))[1] AS open,
        MAX(high) AS high,
        MIN(low)  AS low,
        (ARRAY_AGG(close ORDER BY ts DESC))[1] AS close,
        SUM(volume) AS volume
    FROM bucketed
    GROUP BY bucket_epoch
    ORDER BY bucket_epoch ASC
    """
    with connect() as conn, conn.cursor() as cur:
        cur.execute(sql, {"bucket": bucket, "ticker": ticker, "from_ms": from_ms, "to_ms": to_ms})
        return [dict(r) for r in cur.fetchall()]


def _query_daily(ticker: str, from_date: date, to_date: date) -> list[dict]:
    sql = """
    SELECT date::text, open, high, low, close, volume
    FROM candles_daily WHERE ticker = %s AND date >= %s AND date <= %s
    ORDER BY date ASC
    """
    with connect() as conn, conn.cursor() as cur:
        cur.execute(sql, (ticker, from_date, to_date))
        return [dict(r) for r in cur.fetchall()]


async def get_intraday(ticker: str, from_ms: int, to_ms: int, tf: str) -> list[dict]:
    """Return aggregated bars for [from_ms, to_ms).

    Backfills any minutes that aren't in the DB. We check three regions:
      - "head gap":  [from_ms, earliest_bar)  — cached window is shorter than what
                                                you're asking for now (e.g. user
                                                widened the lookback).
      - "tail gap":  [latest_bar+60s, to_ms)  — bars have closed since we cached.
      - "cold":      everything                — first time we've seen this ticker.

    We don't fill internal holes (gaps within [earliest, latest]); a missing minute
    in the middle of a known range is just a quiet minute, not a cache miss.
    """
    min_ms, max_ms = await asyncio.to_thread(_ts_range_in_window, ticker, from_ms, to_ms)

    if min_ms is None:
        bars = await polygon.fetch_minute_aggs(ticker, from_ms, to_ms)
        await asyncio.to_thread(_insert_minute_bars, ticker, bars)
    else:
        # Head and tail are independent Polygon REST calls — fetch in parallel.
        tasks: list = []
        tail_from = max_ms + 60_000
        if tail_from < to_ms:
            tasks.append(polygon.fetch_minute_aggs(ticker, tail_from, to_ms))
        if from_ms < min_ms:
            tasks.append(polygon.fetch_minute_aggs(ticker, from_ms, min_ms))
        if tasks:
            for bars in await asyncio.gather(*tasks):
                await asyncio.to_thread(_insert_minute_bars, ticker, bars)

    return await asyncio.to_thread(_query_intraday, ticker, from_ms, to_ms, tf)


async def get_daily(ticker: str, from_date: date, to_date: date) -> list[dict]:
    """Daily bars are always backfilled if we don't have full coverage of the requested
    range. Days are sparse enough that one extra REST call per chart load is fine."""
    rows = await asyncio.to_thread(_query_daily, ticker, from_date, to_date)
    expected_business_days = max(1, (to_date - from_date).days // 7 * 5 + 1)  # rough lower bound
    if len(rows) < expected_business_days * 0.5:
        bars = await polygon.fetch_daily_aggs(ticker, from_date, to_date)
        await asyncio.to_thread(_insert_daily_bars, ticker, bars)
        rows = await asyncio.to_thread(_query_daily, ticker, from_date, to_date)
    return rows
