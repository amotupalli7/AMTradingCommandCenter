from massive import WebSocketClient, RESTClient
from massive.websocket.models import WebSocketMessage, Feed, Market
from massive.rest.models import TickerSnapshot, Agg
from typing import List
from datetime import datetime, time as dtime
import time
import pytz

from scanner_v2.models import ScannerState
from scanner_v2.config import Config
from scanner_v2.alerts import send_big_candle_alert, send_hod_alert, send_backside_bounce_alert

BAD_CONDITIONS = {2, 7, 13, 15, 16, 20, 21, 37, 52, 53}
PREMARKET_START = dtime(4, 0, 0)
MARKET_OPEN = dtime(9, 30, 0)
ET = pytz.timezone("US/Eastern")

CANDIDATE_THRESHOLD = 0.10  # fetch agg history for tickers up >= 10% from prev_close


def _now_et() -> dtime:
    return datetime.now(ET).time()


def _is_premarket() -> bool:
    t = _now_et()
    return PREMARKET_START <= t < MARKET_OPEN


def _market_is_open() -> bool:
    return _now_et() >= MARKET_OPEN


def _premarket_start_ms() -> int:
    """Unix ms for 4:00am ET today."""
    now_et = datetime.now(ET)
    start = now_et.replace(hour=4, minute=0, second=0, microsecond=0)
    return int(start.timestamp() * 1000)



def fetch_snapshot(state: ScannerState, config: Config, max_retries: int = 5, retry_delay: int = 10):
    """
    Step 1: Fetch full-market snapshot to seed prev_close, open_price, and
    a rough last_price for all tickers. Also identify gap candidates (>10%).
    Returns the RESTClient for reuse in bootstrap.
    Retries up to max_retries times with retry_delay seconds between attempts.
    """
    after_open = _market_is_open()

    for attempt in range(1, max_retries + 1):
        state.logger.info(f"Fetching full-market snapshot (attempt {attempt}/{max_retries})...")
        candidates = []  # tickers with rough gap >= CANDIDATE_THRESHOLD

        try:
            client = RESTClient(config.API_KEY)
            snapshot = client.get_snapshot_all("stocks")
            count = 0
            with state.lock:
                for item in snapshot:
                    if not (
                        isinstance(item, TickerSnapshot)
                        and isinstance(item.prev_day, Agg)
                        and isinstance(item.prev_day.close, float)
                        and item.prev_day.close > 0
                    ):
                        continue

                    ticker = item.ticker
                    prev_close = item.prev_day.close

                    # Seed open_price if market is already open
                    open_price = None
                    if after_open and isinstance(item.day, Agg) and isinstance(item.day.open, float) and item.day.open > 0:
                        open_price = item.day.open

                    # Rough last price from snapshot (for seeding last_price on startup)
                    rough_last = None
                    if isinstance(item.day, Agg) and isinstance(item.day.close, float) and item.day.close > 0:
                        rough_last = item.day.close

                    # Pre-market high: seed from snapshot's day.high if we're in pre-market
                    # (day.high reflects today's high so far including pre-market on some feeds)
                    premarket_high = None
                    if not after_open and isinstance(item.day, Agg) and isinstance(item.day.high, float) and item.day.high > 0:
                        premarket_high = item.day.high

                    rough_gap_pct = (
                        round((rough_last - prev_close) / prev_close * 100, 2)
                        if rough_last and prev_close > 0
                        else None
                    )
                    state.stock_data[ticker] = {
                        "prev_close": prev_close,
                        "premarket_high": premarket_high,  # max price seen 4am-9:30am
                        "is_gapper": False,                 # set True if premarket_high >= 30% over prev_close
                        "open_price": open_price,
                        "last_price": rough_last,
                        "high": None,
                        "total_volume": 0,
                        "gap_pct": rough_gap_pct,  # seeded from snapshot; updated live on each trade
                        "intraday_gap_pct": None,  # runners: (last - open_price) / open_price
                        "candle_open": None,
                        "candle_high": None,
                        "candle_minute": None,
                        "volume_minutes": None,
                        "hod_rvol": None,
                        "last_hod_alert_minute": None,
                        "backside_hod": None,
                        "backside_hod_ts": None,
                        "backside_low": None,
                        "backside_last_level": 0,
                    }

                    # Screen for bootstrap candidates: rough gap >= CANDIDATE_THRESHOLD
                    if rough_last and prev_close > 0 and (rough_last - prev_close) / prev_close >= CANDIDATE_THRESHOLD:
                        candidates.append(ticker)

                    count += 1

            state.logger.info(
                f"Snapshot loaded: {count} tickers | {len(candidates)} candidates (>={CANDIDATE_THRESHOLD*100:.0f}% gap)."
            )
            return client, candidates

        except Exception as e:
            state.logger.error(f"Error fetching snapshot (attempt {attempt}/{max_retries}): {e}")
            if attempt < max_retries:
                state.logger.info(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)

    state.logger.error("All snapshot fetch attempts failed. Scanner will run without initial data.")
    return None, []


def bootstrap_premarket_highs(state: ScannerState, client: RESTClient, candidates: list):
    """
    Step 2: For gap candidates, fetch 1-minute agg bars from 4am ET to now.
    - Pre-market high: max(bar.high) across 4am-9:30am bars
    - Total volume: sum(bar.volume) across all bars up to now (includes intraday if already open)
    One REST call per ticker — fast.
    """
    if not candidates:
        return

    now_et = datetime.now(ET)
    from_ms = _premarket_start_ms()
    # Always fetch up to now for full volume; track 9:30 cutoff separately for pm_high
    to_ms = int(now_et.timestamp() * 1000)
    pm_cutoff_ms = int(now_et.replace(hour=9, minute=30, second=0, microsecond=0).timestamp() * 1000)

    state.logger.info(f"Bootstrapping pre-market highs + volume via aggs for {len(candidates)} candidates...")

    success = 0
    for ticker in candidates:
        try:
            aggs = client.get_aggs(
                ticker,
                multiplier=1,
                timespan="minute",
                from_=from_ms,
                to=to_ms,
                adjusted=False,
                sort="asc",
                limit=500,
            )
            pm_high = None
            total_vol = 0
            for bar in aggs:
                # Volume: accumulate all bars (pre-market + intraday)
                if hasattr(bar, "volume") and bar.volume is not None:
                    total_vol += bar.volume
                # Pre-market high: only bars before 9:30
                bar_ts = getattr(bar, "timestamp", None)
                if bar_ts is None or bar_ts < pm_cutoff_ms:
                    if hasattr(bar, "high") and bar.high is not None:
                        pm_high = bar.high if pm_high is None else max(pm_high, bar.high)

            with state.lock:
                if ticker in state.stock_data:
                    if pm_high is not None:
                        existing = state.stock_data[ticker].get("premarket_high")
                        state.stock_data[ticker]["premarket_high"] = (
                            max(existing, pm_high) if existing else pm_high
                        )
                    if total_vol > 0:
                        state.stock_data[ticker]["total_volume"] = total_vol

            if pm_high is not None or total_vol > 0:
                success += 1
                state.logger.debug(f"{ticker} PM high: {pm_high} | Vol: {total_vol:,}")
        except Exception as e:
            state.logger.warning(f"Agg bootstrap failed for {ticker}: {e}")

    state.logger.info(f"Pre-market bootstrap complete: {success}/{len(candidates)} tickers updated.")


def classify_gappers(state: ScannerState):
    """
    Step 3: After bootstrap, classify any ticker whose premarket_high is >= 30%
    above prev_close as a gapper. Called once after bootstrap_premarket_highs.
    Also seeds gap_pct so gapper alerts can fire immediately without waiting for
    the first live trade.
    """
    count = 0
    with state.lock:
        for _, data in state.stock_data.items():
            if data.get("is_gapper"):
                continue
            pm_high = data.get("premarket_high")
            prev = data.get("prev_close")
            if pm_high and prev and prev > 0:
                pct = (pm_high - prev) / prev * 100
                if pct >= 30:
                    data["is_gapper"] = True
                    data["gap_pct"] = round(pct, 2)
                    count += 1
    state.logger.info(f"Gapper classification complete: {count} tickers marked as gappers.")


def _fetch_prev_close(ticker: str, state: ScannerState, config: Config):
    """Fetch prev_close for a single ticker via snapshot and backfill it."""
    try:
        client = RESTClient(config.API_KEY)
        item = client.get_snapshot_ticker("stocks", ticker)
        if (
            isinstance(item, TickerSnapshot)
            and isinstance(item.prev_day, Agg)
            and isinstance(item.prev_day.close, float)
            and item.prev_day.close > 0
        ):
            prev_close = item.prev_day.close
            with state.lock:
                if ticker in state.stock_data:
                    entry = state.stock_data[ticker]
                    entry["prev_close"] = prev_close
                    # Recompute gap_pct now that we have prev_close
                    if entry.get("last_price"):
                        entry["gap_pct"] = round(
                            (entry["last_price"] - prev_close) / prev_close * 100, 2
                        )
                    # Classify as gapper if premarket_high qualifies
                    pm_high = entry.get("premarket_high")
                    if pm_high and not entry["is_gapper"]:
                        pct = (pm_high - prev_close) / prev_close * 100
                        if pct >= 30:
                            entry["is_gapper"] = True
                            entry["gap_pct"] = round(pct, 2)
            state.logger.info(f"[Backfill] {ticker} prev_close=${prev_close:.2f}")
    except Exception as e:
        state.logger.warning(f"[Backfill] Failed to fetch prev_close for {ticker}: {e}")


def handle_trade(msgs: List[WebSocketMessage], state: ScannerState, config: Config):
    """Process a batch of live trade messages and update in-memory stock_data."""
    after_open = _market_is_open()
    in_premarket = _is_premarket()
    tickers_need_prev_close = []

    with state.lock:
        for msg in msgs:
            if hasattr(msg, "conditions") and msg.conditions:
                if any(c in BAD_CONDITIONS for c in msg.conditions):
                    continue

            ticker = msg.symbol
            price = msg.price
            size = msg.size

            if ticker not in state.stock_data:
                state.stock_data[ticker] = {
                    "prev_close": None,
                    "premarket_high": None,
                    "is_gapper": False,
                    "open_price": None,
                    "last_price": None,
                    "high": None,
                    "total_volume": 0,
                    "gap_pct": None,
                    "intraday_gap_pct": None,
                    "candle_open": None,
                    "candle_high": None,
                    "candle_minute": None,
                    "volume_minutes": None,
                    "hod_rvol": None,
                    "last_hod_alert_minute": None,
                    "backside_hod": None,
                    "backside_hod_ts": None,
                    "backside_low": None,
                    "backside_last_level": 0,
                }

            entry = state.stock_data[ticker]
            entry["last_price"] = price
            old_high = entry["high"]
            is_new_hod = old_high is not None and price > old_high
            entry["high"] = price if old_high is None else max(old_high, price)
            entry["total_volume"] += size

            # Check if this ticker needs a prev_close backfill
            if (
                entry["prev_close"] is None
                and ticker not in state.fetched_prev_close
                and entry["total_volume"] * price >= 100_000
            ):
                state.fetched_prev_close.add(ticker)
                tickers_need_prev_close.append(ticker)

            # Update pre-market high while in pre-market session
            # Also classify as gapper on the fly if the new high crosses the 30% threshold
            if in_premarket:
                pm = entry.get("premarket_high")
                entry["premarket_high"] = price if pm is None else max(pm, price)
                if not entry["is_gapper"]:
                    prev = entry.get("prev_close")
                    if prev and prev > 0:
                        pct = (entry["premarket_high"] - prev) / prev * 100
                        if pct >= 30:
                            entry["is_gapper"] = True
                            entry["gap_pct"] = round(pct, 2)

            # Capture open price from first trade at/after 9:30
            if after_open and entry["open_price"] is None:
                entry["open_price"] = price
                # Classify this ticker now that market opened (if not already done)
                if not entry["is_gapper"] and entry.get("premarket_high") and entry.get("prev_close"):
                    prev = entry["prev_close"]
                    if prev > 0 and (entry["premarket_high"] - prev) / prev * 100 >= 30:
                        entry["is_gapper"] = True

            # gap_pct: always live vs prev_close (useful for gappers tracking new highs)
            if entry.get("prev_close"):
                entry["gap_pct"] = round(
                    (price - entry["prev_close"]) / entry["prev_close"] * 100, 2
                )

            # intraday_gap_pct: only after open, only for non-gappers
            if after_open and not entry["is_gapper"] and entry.get("open_price"):
                entry["intraday_gap_pct"] = round(
                    (price - entry["open_price"]) / entry["open_price"] * 100, 2
                )

            # Promote to volume tracking only for tickers already alerted as gapper/runner
            if entry["volume_minutes"] is None:
                if ticker in state.alerted_gappers or ticker in state.alerted_runners:
                    entry["volume_minutes"] = {}

            # 1-minute candle tracking + big candle detection
            trade_ts = getattr(msg, "timestamp", None)
            if trade_ts is not None:
                now_minute = int(trade_ts / 60000)

                # Accumulate per-minute volume for promoted tickers
                if entry["volume_minutes"] is not None:
                    entry["volume_minutes"][now_minute] = entry["volume_minutes"].get(now_minute, 0) + size

                if entry["candle_minute"] != now_minute:
                    # New minute bucket — reset candle
                    entry["candle_open"] = price
                    entry["candle_high"] = price
                    entry["candle_minute"] = now_minute
                else:
                    # Same minute — update high
                    if entry["candle_open"] is None:
                        entry["candle_open"] = price
                    if entry["candle_high"] is None or price > entry["candle_high"]:
                        entry["candle_high"] = price

                # Real-time check: alert immediately when candle high is >= 20% above candle open
                # Only scan tickers already flagged as a gapper or intraday runner.
                is_runner = (entry.get("intraday_gap_pct") or 0) >= 30 and price >= 0.15
                is_gapper_qualified = entry["is_gapper"] or (entry.get("gap_pct") or 0) >= 30
                candle_open = entry["candle_open"]
                candle_high = entry["candle_high"]
                if (
                    (is_gapper_qualified or is_runner)
                    and candle_open is not None
                    and candle_high is not None
                    and candle_open >= 0.3
                ):
                    move_pct = (candle_high - candle_open) / candle_open
                    # Alert at each 40% multiple (0.40, 0.80, 1.20, ...)
                    level = int(move_pct / 0.40)
                    if level >= 1 and (ticker, entry["candle_minute"], level) not in state.alerted_big_candles:
                        state.alerted_big_candles.add((ticker, entry["candle_minute"], level))
                        state.pending_alerts.append({
                            "type": "big_candle",
                            "ticker": ticker,
                            "candle_open": candle_open,
                            "candle_high": candle_high,
                            "last_price": price,
                        })

                # New HOD detection — only for tickers already alerted as gapper or runner
                is_hod_qualified = ticker in state.alerted_gappers or ticker in state.alerted_runners
                candle_vol = entry["volume_minutes"].get(now_minute, 0) if entry["volume_minutes"] is not None else 0
                candle_dollar_vol = candle_vol * (entry["candle_high"] or 0)
                if (
                    is_new_hod
                    and is_hod_qualified
                    and entry["volume_minutes"] is not None
                    and entry.get("last_hod_alert_minute") != now_minute
                    and candle_dollar_vol >= 100_000
                ):
                    # Compute rolling average vol/min over last N minutes
                    window = config.hod_rvol_window
                    current_rvol = sum(
                        entry["volume_minutes"].get(m, 0)
                        for m in range(now_minute - window, now_minute)
                    ) / window

                    prev_rvol = entry["hod_rvol"]
                    entry["hod_rvol"] = current_rvol
                    entry["last_hod_alert_minute"] = now_minute

                    # Only alert on 2nd+ HOD (skip first — no comparison)
                    if prev_rvol is not None and prev_rvol > 0 and current_rvol > 0:
                        rvol_ratio = round(current_rvol / prev_rvol, 2)
                        state.pending_alerts.append({
                            "type": "hod",
                            "ticker": ticker,
                            "price": price,
                            "gap_pct": entry.get("gap_pct"),
                            "rvol_ratio": rvol_ratio,
                        })

                # --- Backside bounce tracking ---
                if is_hod_qualified:
                    if is_new_hod:
                        # New HOD resets tracking
                        entry["backside_hod"] = price
                        entry["backside_hod_ts"] = trade_ts
                        entry["backside_low"] = price
                        entry["backside_last_level"] = 0
                    elif entry["backside_hod"] is not None:
                        current_low = entry["backside_low"]
                        if current_low is None or price < current_low:
                            # New low — update and reset level
                            entry["backside_low"] = price
                            entry["backside_last_level"] = 0
                        else:
                            # Bouncing — check retracement levels
                            hod_price = entry["backside_hod"]
                            pullback_range = hod_price - current_low
                            if pullback_range > 0:
                                retracement_pct = (price - current_low) / pullback_range * 100
                                level = int(retracement_pct / 25) * 25
                                level = min(level, 75)
                                if (
                                    level >= 25
                                    and level > entry["backside_last_level"]
                                    and (entry.get("gap_pct") or 0) >= 30
                                    and candle_dollar_vol >= 50_000
                                    and (trade_ts - entry["backside_hod_ts"]) >= config.backside_min_wait_ms
                                    and (ticker, hod_price, current_low, level) not in state.alerted_backside_bounces
                                ):
                                    entry["backside_last_level"] = level
                                    state.alerted_backside_bounces.add((ticker, hod_price, current_low, level))
                                    bounce_from_low_pct = round((price - current_low) / current_low * 100, 2)
                                    state.pending_alerts.append({
                                        "type": "backside_bounce",
                                        "ticker": ticker,
                                        "price": price,
                                        "gap_pct": entry.get("gap_pct"),
                                        "retracement_pct": level,
                                        "bounce_from_low_pct": bounce_from_low_pct,
                                    })

    # Flush pending alerts outside the lock to avoid holding it during HTTP calls
    if state.pending_alerts:
        alerts_to_send = state.pending_alerts[:]
        state.pending_alerts.clear()
        for alert in alerts_to_send:
            if alert.get("type") == "hod":
                send_hod_alert(config, alert, state.logger)
            elif alert.get("type") == "backside_bounce":
                send_backside_bounce_alert(config, alert, state.logger)
            else:
                send_big_candle_alert(
                    config,
                    alert["ticker"],
                    alert["candle_open"],
                    alert["candle_high"],
                    alert["last_price"],
                    state.logger,
                )

    # Backfill prev_close for newly qualifying tickers (outside lock, one REST call each)
    for ticker in tickers_need_prev_close:
        _fetch_prev_close(ticker, state, config)


def run_websocket(state: ScannerState, config: Config, extra_handlers=None):
    """Connect to Polygon WebSocket and stream all stock trades.

    Reconnect strategy: the `massive` library does its own reconnects internally
    (max_reconnects=5 with exponential backoff via the `websockets` library).
    We reuse a single `WebSocketClient` instance — recreating it would risk
    leaving the prior socket lingering on Polygon's side, which trips the
    per-key concurrent-connection limit. If the library fully gives up we wait
    a full minute for any half-open session to drain before re-entering run().

    extra_handlers: optional iterable of callables(msgs) called after handle_trade
    on each batch. Used by the StockScanner web app to fan trades out to the
    candle emitter without modifying the scanner core.
    """
    handlers = list(extra_handlers or [])

    def _dispatch(msgs):
        handle_trade(msgs, state, config)
        for h in handlers:
            try:
                h(msgs)
            except Exception as e:
                state.logger.error(f"extra trade handler failed: {e}")

    state.logger.info("Connecting to Polygon WebSocket (T.*)...")
    client = WebSocketClient(
        api_key=config.API_KEY,
        feed=Feed.RealTime,
        market=Market.Stocks,
        max_reconnects=5,
    )
    # Expose the client so main.py can send Polygon a clean close frame on shutdown.
    state.ws_client = client

    while not state.shutdown_flag.is_set():
        # Re-arm the subscription each iteration; after a max_reconnects exit the
        # library clears self.subs, so the next run() would otherwise connect
        # with no subscriptions.
        client.subscribe("T.*")
        try:
            client.run(_dispatch)
        except Exception as e:
            state.logger.error(f"WebSocket error: {e}")
        if state.shutdown_flag.is_set():
            break
        state.logger.warning("Polygon WS gave up after internal reconnects; waiting 60s for old session to drain...")
        state.shutdown_flag.wait(timeout=60)
