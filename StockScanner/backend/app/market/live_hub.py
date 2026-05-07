"""Live trade fanout for chart panes.

Owns a *second* Polygon websocket connection (separate from scanner_v2's full T.* firehose).
Subscribes per-ticker `T.AAPL` style, dynamically adding/removing subscriptions as chart
panes connect and disconnect.

Per trade we push two kinds of events to subscribers:
  - tick:  {kind: "tick", ticker, ts_ms, price, size}        (every trade)
  - bar:   {kind: "bar",  ticker, ts_ms, o, h, l, c, v}      (when a 1m bar finalizes)

The frontend draws ticks onto its in-progress bar (so the chart wiggles like a real broker
chart) and replaces the in-progress bar with the finalized `bar` event when a new minute
opens.

We deliberately don't write these bars to Postgres here — scanner_v2's candle_emitter is
already doing that for promoted tickers, and for un-promoted tickers the REST backfill in
candles.py handles cold reads. Doing it in two places would race.
"""
from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections import defaultdict
from typing import Iterable

from massive import WebSocketClient
from massive.websocket.models import Feed, Market

from ..config import settings
from . import polygon as polygon_rest
from . import candles as candles_store

logger = logging.getLogger(__name__)

# Trade conditions to filter out (late prints, off-exchange, corrections, etc).
# Kept in sync with scanner_v2/ingest.py BAD_CONDITIONS — both processes consume
# the same Polygon T.* feed and need identical filtering, but the two run as
# separate processes so we can't import across the boundary.
BAD_CONDITIONS = frozenset({2, 7, 13, 15, 16, 20, 21, 37, 52, 53})


class _Bar:
    __slots__ = ("minute", "o", "h", "l", "c", "v", "primed")

    def __init__(self, minute: int, price: float, size: int) -> None:
        self.minute = minute
        self.o = self.h = self.l = self.c = price
        self.v = size
        # Whether Polygon REST has supplied the authoritative O/H/L/V for this minute.
        # We only prime once per minute — once primed, subsequent ticks just extend.
        self.primed = False

    def update(self, price: float, size: int) -> None:
        if price > self.h:
            self.h = price
        if price < self.l:
            self.l = price
        self.c = price
        self.v += size

    def to_event(self, ticker: str) -> dict:
        return {
            "kind": "bar",
            "ticker": ticker,
            "ts_ms": self.minute * 60_000,
            "o": self.o, "h": self.h, "l": self.l, "c": self.c, "v": self.v,
        }


class LiveTradeHub:
    def __init__(self) -> None:
        # ticker -> set[asyncio.Queue]
        self._subs: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._lock = asyncio.Lock()

        # In-progress bar per ticker (computed in the WS callback thread)
        self._bars: dict[str, _Bar] = {}
        self._bars_lock = threading.Lock()

        self._client: WebSocketClient | None = None
        self._client_thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None  # main asyncio loop
        # Set on shutdown so the reconnect loop exits cleanly. Without this, a
        # uvicorn --reload restart can leave the old daemon thread retrying against
        # Polygon while the new process opens its own WS, tripping the 1-connection
        # limit and getting 1008 policy-violation rejects on both.
        self._stop = threading.Event()

    # ---------- subscription management ----------

    async def subscribe(self, ticker: str) -> asyncio.Queue:
        ticker = ticker.upper()
        q: asyncio.Queue = asyncio.Queue(maxsize=256)
        async with self._lock:
            first = ticker not in self._subs or len(self._subs[ticker]) == 0
            self._subs[ticker].add(q)
            if first:
                self._add_polygon_sub(ticker)
        # Send any current in-progress bar to the new subscriber immediately so the
        # chart isn't blank while the prime runs.
        with self._bars_lock:
            bar = self._bars.get(ticker)
        if bar is not None:
            await q.put(bar.to_event(ticker))
        # Prime from REST when we don't yet have an authoritative bar — covers
        # the cold-subscribe case and the sparse-ticker case where a bar was
        # built from one early WS tick before REST data arrived.
        if bar is None or not bar.primed:
            asyncio.create_task(self._prime_in_progress(ticker))
        return q

    async def _prime_in_progress(self, ticker: str, q: asyncio.Queue | None = None) -> None:
        """Fetch Polygon's 1-minute aggregate covering the *current* minute and seed
        the in-progress bar with it.

        Why we always overwrite (instead of only filling when missing): for sparse /
        illiquid tickers (e.g. GLE), the WS callback may build a bar from just one
        or two trades that landed mid-minute, missing the actual minute open. Polygon
        REST has every trade since minute-start up to fetch time, so it's strictly
        more authoritative for O/H/L/V. The tiny window between REST snapshot and
        next WS tick (< 200ms typical) is negligible — close/high/low will catch up
        within one tick. Volume from REST is accurate to the snapshot moment.

        Called both on initial subscribe and on minute rollover.
        """
        try:
            now_ms = int(time.time() * 1000)
            minute_start_ms = (now_ms // 60_000) * 60_000
            current_minute = minute_start_ms // 60_000

            bars = await polygon_rest.fetch_minute_aggs(ticker, minute_start_ms, now_ms + 1)
            if not bars:
                return
            b = bars[-1]
            ts_ms = int(b["ts_ms"])
            if ts_ms // 60_000 != current_minute:
                return  # REST returned the previous minute, not the current one

            with self._bars_lock:
                bar = self._bars.get(ticker)
                if bar is None or bar.minute != current_minute:
                    # No bar yet for this minute — create from REST data verbatim.
                    bar = _Bar(current_minute, float(b["open"]), int(b["volume"]))
                    bar.h = float(b["high"])
                    bar.l = float(b["low"])
                    bar.c = float(b["close"])
                    self._bars[ticker] = bar
                else:
                    # Bar already exists — replace OHLC + volume with Polygon's truth.
                    # Any WS ticks that arrive after this is set get applied normally.
                    bar.o = float(b["open"])
                    bar.h = max(bar.h, float(b["high"]))
                    bar.l = min(bar.l, float(b["low"]))
                    bar.c = float(b["close"])
                    bar.v = max(bar.v, int(b["volume"]))
                bar.primed = True
                snapshot_event = bar.to_event(ticker)

            # Fan out the corrected bar to all subscribers, not just the one that
            # triggered the prime.
            await self._fanout(ticker, snapshot_event)
        except Exception:
            logger.debug("prime_in_progress failed for %s", ticker, exc_info=True)

    async def unsubscribe(self, ticker: str, q: asyncio.Queue) -> None:
        ticker = ticker.upper()
        async with self._lock:
            subs = self._subs.get(ticker)
            if subs:
                subs.discard(q)
                if not subs:
                    del self._subs[ticker]
                    self._remove_polygon_sub(ticker)
                    # Drop the in-progress bar so the dict doesn't grow unbounded
                    # as the user pages through tickers.
                    with self._bars_lock:
                        self._bars.pop(ticker, None)

    # ---------- polygon websocket lifecycle ----------

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        """Spin up the Polygon WS in a background thread. Idempotent."""
        if self._client_thread is not None:
            return
        if not settings.POLYGON_API_KEY:
            logger.warning("LiveTradeHub.start: POLYGON_API_KEY missing; live charts disabled")
            return
        self._loop = loop
        self._stop.clear()
        # max_reconnects=5 (library default) is OK; what matters is that the
        # `massive` library's internal reconnect loop is the *only* one — our
        # outer loop used to race it and double-count concurrent connections.
        self._client = WebSocketClient(
            api_key=settings.POLYGON_API_KEY, feed=Feed.RealTime, market=Market.Stocks,
            max_reconnects=5,
        )
        self._client_thread = threading.Thread(
            target=self._run_client, name="live-trade-ws", daemon=True
        )
        self._client_thread.start()
        logger.info("LiveTradeHub started")

    def stop(self) -> None:
        """Signal the WS loop to exit and explicitly send a close frame to Polygon.

        Without the close frame Polygon's gateway can hold the slot open until its
        idle timeout (~60-120s); ghost sessions then accumulate across restarts
        and trip the per-key concurrent-connection limit. WebSocketClient.close()
        is async so we drive it on a fresh event loop here.
        """
        self._stop.set()
        client = self._client
        if client is None:
            return
        try:
            asyncio.run(client.close())
        except Exception:
            logger.debug("WS close errored", exc_info=True)

    def _run_client(self) -> None:
        # Single, simple loop. The `massive` library's `connect()` already does
        # its own reconnect-with-backoff inside `client.run()` (max_reconnects=5).
        # We only re-enter `run()` if it gave up entirely — and we wait long enough
        # that any half-open Polygon session has timed out before reconnecting.
        # Previously we had nested reconnect loops (this one + the library's),
        # which during transient errors caused two concurrent socket attempts and
        # tripped Polygon's 1-connection-per-key limit.
        while not self._stop.is_set():
            # Re-arm any tickers chart panes are watching — after max_reconnects
            # the library clears its sub set, so without this the next run()
            # would connect with no subscriptions.
            for ticker in list(self._subs.keys()):
                self._client.subscribe(f"T.{ticker}")
            try:
                self._client.run(self._on_msgs)
            except Exception as e:
                if "1008" in str(e) or "policy violation" in str(e).lower():
                    logger.warning("live-trade-ws rejected by Polygon (already-connected). "
                                   "Waiting 30s for old session to drain.")
                else:
                    logger.exception("live-trade-ws errored")
            if self._stop.wait(30):
                break

    def _add_polygon_sub(self, ticker: str) -> None:
        if self._client is not None:
            self._client.subscribe(f"T.{ticker}")

    def _remove_polygon_sub(self, ticker: str) -> None:
        if self._client is not None and hasattr(self._client, "unsubscribe"):
            try:
                self._client.unsubscribe(f"T.{ticker}")  # type: ignore[attr-defined]
            except Exception:
                pass

    # ---------- trade fanout ----------

    def _on_msgs(self, msgs: Iterable) -> None:
        # Runs in the websocket thread, NOT the asyncio loop. Hot path: every
        # incoming Polygon trade comes through here. Keep the per-message work
        # minimal and avoid redundant attribute lookups.
        per_ticker: dict[str, list[dict]] = {}
        rollovers: set[str] = set()
        rollovers_finalized: dict[str, int] = {}

        with self._bars_lock:
            for msg in msgs:
                conds = getattr(msg, "conditions", None)
                if conds and not BAD_CONDITIONS.isdisjoint(conds):
                    continue
                ticker = getattr(msg, "symbol", None)
                price = getattr(msg, "price", None)
                ts = getattr(msg, "timestamp", None)
                if ticker is None or price is None or ts is None:
                    continue
                size = int(getattr(msg, "size", None) or 0)
                ts = int(ts)
                price_f = float(price)
                minute = ts // 60_000

                events_for_ticker = per_ticker.get(ticker)
                if events_for_ticker is None:
                    events_for_ticker = []
                    per_ticker[ticker] = events_for_ticker
                events_for_ticker.append({
                    "kind": "tick", "ticker": ticker,
                    "ts_ms": ts, "price": price_f, "size": size,
                })

                bar = self._bars.get(ticker)
                if bar is None or bar.minute != minute:
                    if bar is not None and bar.minute < minute:
                        events_for_ticker.append(bar.to_event(ticker))
                        rollovers_finalized[ticker] = bar.minute
                    self._bars[ticker] = _Bar(minute, price_f, size)
                    rollovers.add(ticker)
                else:
                    bar.update(price_f, size)

        if self._loop is None:
            return
        # One coroutine per ticker per batch, instead of one per tick.
        for ticker, evs in per_ticker.items():
            asyncio.run_coroutine_threadsafe(self._fanout_many(ticker, evs), self._loop)
        # Re-prime any tickers that just rolled into a new minute. Done after fanout
        # so the chart sees the placeholder bar immediately, then gets the corrected
        # version from REST a moment later.
        for ticker in rollovers:
            asyncio.run_coroutine_threadsafe(self._prime_in_progress(ticker), self._loop)
        # Also correct the *just-finalized* (previous) minute's row in the DB. Polygon
        # REST has every print for that minute now, so this overwrites whatever wrong
        # bar may have been built from sparse WS ticks during the prior minute.
        for ticker, prev_minute in rollovers_finalized.items():
            asyncio.run_coroutine_threadsafe(
                candles_store.correct_finalized_minute(ticker, prev_minute * 60_000),
                self._loop,
            )

    async def _fanout(self, ticker: str, event: dict) -> None:
        await self._fanout_many(ticker, [event])

    async def _fanout_many(self, ticker: str, events: list[dict]) -> None:
        # Lock-free read of the subscriber set. _subs is mutated only on the
        # asyncio loop (subscribe/unsubscribe), so a snapshot copy here is safe.
        subs_set = self._subs.get(ticker.upper())
        if not subs_set:
            return
        subs = list(subs_set)
        for q in subs:
            for event in events:
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    try: q.get_nowait()
                    except asyncio.QueueEmpty: pass
                    try: q.put_nowait(event)
                    except asyncio.QueueFull: pass


hub = LiveTradeHub()
