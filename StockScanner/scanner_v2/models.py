import threading
import logging
from typing import Dict, Set, List, Tuple


class ScannerState:
    def __init__(self, logger: logging.Logger):
        # Main in-memory store: ticker -> {prev_close, last_price, high, total_volume, gap_pct, ...}
        self.stock_data: Dict[str, dict] = {}
        self.lock = threading.Lock()
        self.shutdown_flag = threading.Event()
        self.logger = logger

        # Tickers that have already been alerted — never alert the same ticker twice per session
        self.alerted_gappers: Set[str] = set()    # pre-market gap >= 30% vs prev close
        self.alerted_runners: Set[str] = set()    # intraday runner >= 30% vs open

        # Big candle alerts: keyed by (ticker, candle_minute) — fires once per qualifying candle
        self.alerted_big_candles: Set[Tuple[str, int]] = set()

        # Backside bounce alerts: keyed by (ticker, hod_price, low_price, retracement_level)
        self.alerted_backside_bounces: Set[Tuple[str, float, float, int]] = set()

        # Pending Discord alerts to flush after releasing the lock (avoids HTTP calls under lock)
        self.pending_alerts: List[dict] = []

        # Tickers we've already attempted a single-ticker snapshot fetch for (avoid repeat calls)
        self.fetched_prev_close: Set[str] = set()

        # Polygon WS client handle — set by run_websocket() so main.py's shutdown
        # path can call its async close() and have Polygon free the session slot.
        self.ws_client = None
