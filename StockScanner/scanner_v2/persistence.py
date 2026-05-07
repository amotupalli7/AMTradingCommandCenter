import json
import time
from datetime import date
from pathlib import Path

from scanner_v2.models import ScannerState
from scanner_v2.config import Config


def save_data(state: ScannerState, config: Config):
    """Atomically write stock_data to JSON (temp file → rename), tagged with today's date."""
    try:
        with state.lock:
            snapshot = dict(state.stock_data)

        payload = {"date": date.today().isoformat(), "data": snapshot}
        tmp = config.data_file.with_suffix(".tmp")
        with open(tmp, "w") as f:
            json.dump(payload, f)
        tmp.replace(config.data_file)
        state.logger.debug(f"Saved {len(snapshot)} tickers to {config.data_file}")
    except Exception as e:
        state.logger.error(f"Error saving data: {e}")


def load_data(state: ScannerState, config: Config):
    """On startup, restore last_price/high/total_volume from a previous session's JSON.
    Skips loading if the file is from a prior calendar day (stale data)."""
    if not config.data_file.exists():
        return

    try:
        with open(config.data_file, "r") as f:
            payload = json.load(f)

        # Support old format (plain dict) and new format (with date tag)
        if isinstance(payload, dict) and "date" in payload and "data" in payload:
            saved_date = payload["date"]
            saved = payload["data"]
        else:
            saved_date = None
            saved = payload

        if saved_date != date.today().isoformat():
            state.logger.info(f"Skipping stale session data from {saved_date or 'unknown date'}.")
            return

        count = 0
        with state.lock:
            for ticker, data in saved.items():
                if ticker in state.stock_data:
                    # Restore session stats but keep fresh prev_close from REST
                    entry = state.stock_data[ticker]
                    if data.get("last_price") is not None:
                        entry["last_price"] = data["last_price"]
                    if data.get("high") is not None:
                        entry["high"] = data["high"]
                    if data.get("total_volume"):
                        entry["total_volume"] = data["total_volume"]
                    count += 1

        state.logger.info(f"Restored session data for {count} tickers from {config.data_file}")
    except Exception as e:
        state.logger.error(f"Error loading saved data: {e}")


def run_save_loop(state: ScannerState, config: Config):
    """Daemon thread: periodically flush stock_data to disk."""
    while not state.shutdown_flag.is_set():
        time.sleep(config.save_interval)
        if not state.shutdown_flag.is_set():
            save_data(state, config)
