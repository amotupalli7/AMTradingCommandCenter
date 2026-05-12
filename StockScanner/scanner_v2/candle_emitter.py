"""Live 1-minute candle emitter for the StockScanner web app.

Plumbed into scanner_v2 as an `extra_handlers` callback on the trade stream. It builds
1m OHLCV bars in memory and persists finalized bars to Postgres `scanner_db.candles_1m`
for any ticker that has been promoted (is_gapper or alerted runner). For non-promoted
tickers the web backend can fetch history from Polygon REST on demand.

Why minute-bucket via timestamp / 60000:
    Same scheme used by ingest.py for `candle_minute`, so our bar boundaries match the
    scanner's existing big-candle / HOD logic.

Why we ignore trades with conditions in BAD_CONDITIONS:
    Same set ingest.py filters — official trade types only, no late prints / corrections.
    Otherwise the candle would be poisoned by off-exchange or out-of-sequence prints.
"""
from __future__ import annotations

import logging
import os
import queue
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import psycopg

from scanner_v2.ingest import BAD_CONDITIONS
from scanner_v2.models import ScannerState

# Reuse the backend's Settings (env loading, pg_dsn) and Polygon helpers so we
# don't drift. scanner_v2 is launched from StockScanner/, so backend/ is a sibling.
_BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
from app.config import settings as _backend_settings  # noqa: E402
from app.market import polygon as _polygon            # noqa: E402
from app.market.candles import _insert_minute_bars    # noqa: E402


# Upsert semantics: max-merge for high, min-merge for low, overwrite open/close.
# Volume MUST NOT sum — the backend's correct_finalized_minute may have already
# written Polygon's authoritative cumulative volume; summing on top would double-count.
# Instead, take the max — Polygon's value is always cumulative-truth and ≥ our WS count.
_UPSERT_SQL = """
INSERT INTO candles_1m (ticker, ts, open, high, low, close, volume)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (ticker, ts) DO UPDATE SET
    high   = GREATEST(candles_1m.high, EXCLUDED.high),
    low    = LEAST(candles_1m.low, EXCLUDED.low),
    close  = EXCLUDED.close,
    volume = GREATEST(candles_1m.volume, EXCLUDED.volume)
"""


class CandleEmitter:
    def __init__(self, state: ScannerState, logger: logging.Logger):
        self.state = state
        self.logger = logger
        # ticker -> (minute_bucket, open, high, low, close, volume)
        self._bars: dict[str, list] = {}
        self._lock = threading.Lock()
        self._conn: psycopg.Connection | None = None

        # REST-correction worker: when a minute finalizes the WS-derived bar might
        # be incomplete (scanner_v2 started mid-minute, sparse trade conditions, etc).
        # Polygon REST has every print after a ~1-2s settle delay, so we queue each
        # finalized (ticker, minute) and let a background worker overwrite the DB
        # row authoritatively. Keeps REST off the trade-handling hot path.
        self._correct_q: "queue.Queue[tuple[str,int]]" = queue.Queue()
        self._correct_stop = threading.Event()
        self._poly_client = None  # lazy
        threading.Thread(target=self._correct_worker, name="candle-correct",
                         daemon=True).start()
        # Stale-bar flush: an in-memory bar only flushes on minute rollover, so a
        # ticker that trades in minute N then goes silent never persists. If
        # scanner_v2 restarts during the quiet window, that bar is lost. Periodic
        # flush every ~5s catches these once minute_bucket is more than a minute old.
        threading.Thread(target=self._stale_flush_worker, name="candle-stale-flush",
                         daemon=True).start()

    def _conn_ok(self) -> psycopg.Connection:
        if self._conn is None or self._conn.closed:
            self._conn = psycopg.connect(_backend_settings.pg_dsn, autocommit=True)
        return self._conn

    def _is_tracked(self, ticker: str) -> bool:
        """A ticker is tracked once the scanner promotes it (gapper or alerted runner).
        Reads from the scanner state — no separate set to keep in sync."""
        if ticker in self.state.alerted_gappers or ticker in self.state.alerted_runners:
            return True
        entry = self.state.stock_data.get(ticker)
        return bool(entry and entry.get("is_gapper"))

    # NOTE: today _flush is only called on minute-rollover and shutdown, so each bar
    # is flushed exactly once and the `volume = volume + EXCLUDED.volume` upsert is
    # correct. If we later add mid-bar flushes for live chart streaming, switch to
    # `volume = EXCLUDED.volume` and have the caller pass the absolute current volume.
    def _flush(self, ticker: str, bar: list) -> None:
        minute_bucket, o, h, l, c, v = bar
        ts = datetime.fromtimestamp(minute_bucket * 60, tz=timezone.utc)
        try:
            with self._conn_ok().cursor() as cur:
                cur.execute(_UPSERT_SQL, (ticker, ts, o, h, l, c, v))
        except psycopg.Error as e:
            self.logger.warning(f"candle flush failed for {ticker} @ {ts}: {e}")
            self._conn = None  # force reconnect next time

    def handle_trades(self, msgs: Iterable) -> None:
        """Called once per websocket batch. Mirrors ingest.handle_trade's per-message guard."""
        finalized: list[tuple[str, list]] = []

        with self._lock:
            for msg in msgs:
                conds = getattr(msg, "conditions", None)
                if conds and any(c in BAD_CONDITIONS for c in conds):
                    continue

                ticker = msg.symbol
                price = msg.price
                size = msg.size or 0
                trade_ts = getattr(msg, "timestamp", None)
                if trade_ts is None:
                    continue
                minute_bucket = int(trade_ts / 60000)

                # Only track promoted tickers — keeps the bar map tiny.
                if not self._is_tracked(ticker):
                    continue

                cur = self._bars.get(ticker)
                if cur is None or cur[0] != minute_bucket:
                    if cur is not None:
                        finalized.append((ticker, cur))
                    self._bars[ticker] = [minute_bucket, price, price, price, price, size]
                else:
                    cur[2] = max(cur[2], price)  # high
                    cur[3] = min(cur[3], price)  # low
                    cur[4] = price                # close
                    cur[5] += size                # volume

        for ticker, bar in finalized:
            self._flush(ticker, bar)
            # Queue a REST correction so the row reflects every print Polygon saw,
            # not just the trades scanner_v2's WS happened to receive this minute.
            self._correct_q.put((ticker, bar[0]))

    def flush_all(self) -> None:
        """Persist whatever in-progress bars we have. Safe to call on shutdown."""
        with self._lock:
            snapshot = list(self._bars.items())
            self._bars.clear()
        for ticker, bar in snapshot:
            self._flush(ticker, bar)
        self._correct_stop.set()

    # ---------- stale-bar flush ----------

    def _stale_flush_worker(self) -> None:
        """Drain in-memory bars whose minute has fully closed but no new trade
        has rolled them over. Run every ~5s; only flush bars whose minute is
        more than one minute old to give a grace window for late prints and
        avoid racing live handle_trades on the current/just-closed minute."""
        while not self._correct_stop.is_set():
            if self._correct_stop.wait(5.0):
                break
            now_minute = int(time.time() // 60)
            cutoff = now_minute - 1  # only flush bars older than this
            stale: list[tuple[str, list]] = []
            with self._lock:
                for ticker, bar in list(self._bars.items()):
                    if bar[0] < cutoff:
                        stale.append((ticker, bar))
                        del self._bars[ticker]
            for ticker, bar in stale:
                try:
                    self._flush(ticker, bar)
                    self._correct_q.put((ticker, bar[0]))
                except Exception as e:
                    self.logger.debug(f"stale flush failed for {ticker}: {e}")

    # ---------- REST correction ----------

    def _correct_worker(self) -> None:
        """Drain (ticker, minute) tasks. Wait ~1.5s after minute close so Polygon's
        bar has settled, then fetch and overwrite."""
        while not self._correct_stop.is_set():
            try:
                ticker, minute_bucket = self._correct_q.get(timeout=1)
            except queue.Empty:
                continue
            try:
                self._correct_one(ticker, minute_bucket)
            except Exception as e:
                self.logger.debug(f"correction failed for {ticker} {minute_bucket}: {e}")

    def _correct_one(self, ticker: str, minute_bucket: int) -> None:
        target_close_ms = (minute_bucket + 1) * 60_000
        wait_s = max(0.0, (target_close_ms + 1500) / 1000.0 - time.time())
        if wait_s > 0:
            time.sleep(wait_s)

        from_ms = minute_bucket * 60_000
        bars = _polygon.fetch_minute_aggs_sync(ticker, from_ms, from_ms + 60_000)
        target = next((b for b in bars if (int(b["ts_ms"]) // 60_000) == minute_bucket), None)
        if target is None:
            return
        _insert_minute_bars(ticker, [target])
