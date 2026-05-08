"""Per-day enrichment cache. Key is `(ticker, date)`; value is the assembled
payload (reference + filings + ownership). Reference data and EDGAR filings
don't change throughout the day, so one cache hit per ticker per day saves
multiple slow REST/EDGAR calls."""
from __future__ import annotations

import asyncio
import json
from datetime import date as date_cls
from typing import Any

from ..db.session import connect


def _read_sync(ticker: str, today: date_cls) -> dict[str, Any] | None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT payload FROM enrichment_cache WHERE ticker = %s AND date = %s",
            (ticker, today),
        )
        row = cur.fetchone()
        if not row:
            return None
        payload = row.get("payload")
        return payload if isinstance(payload, dict) else json.loads(payload)


def _write_sync(ticker: str, today: date_cls, payload: dict[str, Any]) -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO enrichment_cache (ticker, date, payload, fetched_at)
            VALUES (%s, %s, %s, now())
            ON CONFLICT (ticker, date)
            DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()
            """,
            (ticker, today, json.dumps(payload, default=str)),
        )
        conn.commit()


async def read(ticker: str, today: date_cls) -> dict[str, Any] | None:
    return await asyncio.to_thread(_read_sync, ticker, today)


async def write(ticker: str, today: date_cls, payload: dict[str, Any]) -> None:
    await asyncio.to_thread(_write_sync, ticker, today, payload)
