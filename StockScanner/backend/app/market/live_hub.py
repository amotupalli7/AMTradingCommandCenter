"""Live trade fanout for chart panes.

Consumes scanner_v2's local TCP trade gateway (127.0.0.1:8765) instead of opening
its own Polygon WebSocket. Polygon allows only one concurrent WS per API key, and
scanner_v2 already holds it open for the T.* firehose, so opening a second from
the backend trips a 1008 policy-violation reject.

The gateway streams *all* trades scanner_v2 sees. We only build in-progress bars
and fan out events for tickers a chart pane has subscribed to — the firehose
contains thousands of tickers and we'd OOM otherwise.

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
import json
import logging
import socket
import threading
import time
from collections import defaultdict
from typing import Iterable

from ..config import settings
from . import polygon as polygon_rest
from . import candles as candles_store

logger = logging.getLogger(__name__)

# Trade conditions to filter out (late prints, off-exchange, corrections, etc).
# scanner_v2's gateway already filters these — kept here defensively in case the
# gateway is bypassed (tests, debugging) or runs an older filter set.
BAD_CONDITIONS = frozenset({2, 7, 13, 15, 16, 20, 21, 37, 52, 53})


class _GatewayTrade:
    """Duck-typed Polygon trade message. The gateway sends compact JSON with
    short field names; this object presents the same attribute surface as the
    `massive` library's trade message (.symbol/.price/.size/.timestamp/.conditions)
    so _on_msgs doesn't care about the transport.
    """
    __slots__ = ("symbol", "price", "size", "timestamp", "conditions")

    def __init__(self, d: dict) -> None:
        self.symbol = d.get("s")
        self.price = d.get("p")
        self.size = d.get("z") or 0
        self.timestamp = d.get("t")
        self.conditions = d.get("c")


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

        # In-progress bar per ticker (computed in the gateway-client thread)
        self._bars: dict[str, _Bar] = {}
        self._bars_lock = threading.Lock()

        self._client_thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None  # main asyncio loop
        # Set on shutdown so the reconnect loop exits cleanly.
        self._stop = threading.Event()
        self._gateway_host = settings.TRADE_GATEWAY_HOST
        self._gateway_port = settings.TRADE_GATEWAY_PORT

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

            # Polygon's REST aggregate for the current minute can lag the live trade
            # stream by 1-2s right after a minute rollover. Retry once after a short
            # sleep so the open seed actually reflects this minute's first prints.
            bars = await polygon_rest.fetch_minute_aggs(ticker, minute_start_ms, now_ms + 1)
            b = bars[-1] if bars else None
            if b is None or int(b["ts_ms"]) // 60_000 != current_minute:
                await asyncio.sleep(1.0)
                retry_now_ms = int(time.time() * 1000)
                bars = await polygon_rest.fetch_minute_aggs(ticker, minute_start_ms, retry_now_ms + 1)
                b = bars[-1] if bars else None
                if b is None or int(b["ts_ms"]) // 60_000 != current_minute:
                    return
            ts_ms = int(b["ts_ms"])

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

    # ---------- gateway client lifecycle ----------

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        """Spin up the gateway-client reader thread. Idempotent."""
        if self._client_thread is not None:
            return
        self._loop = loop
        self._stop.clear()
        self._client_thread = threading.Thread(
            target=self._run_client, name="live-trade-gateway", daemon=True
        )
        self._client_thread.start()
        logger.info("LiveTradeHub started (gateway %s:%d)", self._gateway_host, self._gateway_port)

    def stop(self) -> None:
        """Signal the reader to exit. Socket close happens in _run_client."""
        self._stop.set()

    def _run_client(self) -> None:
        """Connect to scanner_v2's trade gateway, parse JSON-line trades, and
        feed batches into _on_msgs. Reconnects forever with backoff — the
        gateway may not be up yet on first backend boot, and scanner_v2
        restarts shouldn't kill chart streaming.

        Batching: gateway writes are TCP-coalesced (TCP_NODELAY on the server
        side means small writes ship promptly, but the kernel still groups them).
        We read up to ~64KB, split on newlines, hand the resulting list to
        _on_msgs — preserves the original "batch per WS message" hot-path shape.
        """
        # Initial startup pause. scanner_v2 takes ~15-30s to bootstrap (full
        # market snapshot + premarket high backfill) before it starts the
        # gateway server. Connecting any sooner just fails and spams warnings.
        startup_delay = settings.LIVE_HUB_STARTUP_DELAY
        if startup_delay > 0:
            logger.info("live-trade-gateway: waiting %.1fs for scanner_v2 to start", startup_delay)
            if self._stop.wait(startup_delay):
                return
        backoff = 1.0
        while not self._stop.is_set():
            sock: socket.socket | None = None
            try:
                sock = socket.create_connection(
                    (self._gateway_host, self._gateway_port), timeout=5.0
                )
                sock.settimeout(None)
            except OSError as e:
                logger.warning(
                    "live-trade-gateway: cannot connect to %s:%d (%s); "
                    "retrying in %.1fs. Is scanner_v2 running?",
                    self._gateway_host, self._gateway_port, e, backoff,
                )
                if self._stop.wait(backoff):
                    return
                backoff = min(backoff * 2, 30.0)
                continue

            # Connected. Clear any stale in-progress bars from the prior session
            # so the first tick re-primes from REST rather than rolling over a
            # bar from before the gateway dropped. Re-prime each ticker the chart
            # panes are watching.
            with self._bars_lock:
                self._bars.clear()
            if self._loop is not None:
                for ticker in list(self._subs.keys()):
                    asyncio.run_coroutine_threadsafe(
                        self._prime_in_progress(ticker), self._loop
                    )
            backoff = 1.0
            logger.info("live-trade-gateway connected")

            try:
                self._read_loop(sock)
            except Exception:
                logger.exception("live-trade-gateway read errored")
            finally:
                try: sock.close()
                except OSError: pass
                logger.warning("live-trade-gateway disconnected; will reconnect")
                if self._stop.wait(backoff):
                    return

    def _read_loop(self, sock: socket.socket) -> None:
        """Read newline-delimited JSON trades, batch by recv chunk, decode into
        _GatewayTrade objects, hand to _on_msgs as a list."""
        buf = bytearray()
        while not self._stop.is_set():
            chunk = sock.recv(65536)
            if not chunk:
                return  # gateway closed
            buf.extend(chunk)
            # Split out complete lines; keep any partial trailing line in buf.
            *lines, rest = buf.split(b"\n")
            buf = bytearray(rest)
            if not lines:
                continue
            trades: list[_GatewayTrade] = []
            for raw in lines:
                if not raw:
                    continue
                try:
                    d = json.loads(raw)
                except ValueError:
                    continue
                trades.append(_GatewayTrade(d))
            if trades:
                self._on_msgs(trades)

    # Legacy helpers — kept as no-ops so call sites in subscribe/unsubscribe
    # don't need to branch. The gateway sends the firehose; per-ticker
    # subscribe/unsubscribe to Polygon is no longer our concern.
    def _add_polygon_sub(self, ticker: str) -> None:
        pass

    def _remove_polygon_sub(self, ticker: str) -> None:
        pass

    # ---------- trade fanout ----------

    def _on_msgs(self, msgs: Iterable) -> None:
        # Runs in the gateway-client thread, NOT the asyncio loop. Hot path:
        # every trade scanner_v2 sees flows through here. Keep work minimal.
        per_ticker: dict[str, list[dict]] = {}
        rollovers: set[str] = set()
        # (ticker, minute) — set rather than dict so a batch that crosses two
        # minute boundaries for the same ticker (rare but possible at high latency)
        # corrects both finalized rows, not just the last.
        rollovers_finalized: set[tuple[str, int]] = set()

        # Snapshot subscribed tickers once per batch. The firehose contains
        # thousands of tickers and we'd OOM building _bars for all of them;
        # only chart-pane subscribers matter here. _subs is mutated on the
        # asyncio loop; this dict read is safe (atomic in CPython).
        subscribed = set(self._subs.keys())
        if not subscribed:
            return

        with self._bars_lock:
            for msg in msgs:
                conds = getattr(msg, "conditions", None)
                if conds and not BAD_CONDITIONS.isdisjoint(conds):
                    continue
                ticker = getattr(msg, "symbol", None)
                if ticker not in subscribed:
                    continue
                price = getattr(msg, "price", None)
                ts = getattr(msg, "timestamp", None)
                if price is None or ts is None:
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
                        rollovers_finalized.add((ticker, bar.minute))
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
        for ticker, prev_minute in rollovers_finalized:
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
