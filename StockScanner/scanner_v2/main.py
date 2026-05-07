import asyncio
import logging
import sys
import threading

from scanner_v2.config import Config
from scanner_v2.models import ScannerState
from scanner_v2.ingest import fetch_snapshot, bootstrap_premarket_highs, classify_gappers, run_websocket
from scanner_v2.scanner import run_gap_scanner
from scanner_v2.persistence import load_data, save_data, run_save_loop
from scanner_v2.candle_emitter import CandleEmitter


def setup_logger(config: Config) -> logging.Logger:
    logger = logging.getLogger("scanner_v2")
    logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%H:%M:%S")

    fh = logging.FileHandler(config.log_file)
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)

    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger


def main():
    config = Config()
    logger = setup_logger(config)
    state = ScannerState(logger)

    # 1. Fetch full-market snapshot (prev_close, open_price, rough last, pre-market high seed)
    rest_client, candidates = fetch_snapshot(state, config)

    # 2. Bootstrap pre-market highs for gap candidates via trade history (4am → now)
    if rest_client:
        bootstrap_premarket_highs(state, rest_client, candidates)
        classify_gappers(state)

    # 3. Restore any session data from the last run
    load_data(state, config)

    # Live 1m candle emitter — writes promoted-ticker bars to scanner_db.candles_1m
    candle_emitter = CandleEmitter(state, logger)

    # 3. Start all worker threads (all daemon so they die if main exits)
    threading.Thread(
        target=run_websocket,
        args=(state, config),
        kwargs={"extra_handlers": [candle_emitter.handle_trades]},
        daemon=True,
        name="websocket",
    ).start()
    threading.Thread(target=run_save_loop, args=(state, config), daemon=True, name="save_loop").start()
    threading.Thread(target=run_gap_scanner, args=(state, config), daemon=True, name="gap_scanner").start()

    logger.info("Scanner v2 running. Press Ctrl+C to stop.")

    # 4. Main thread just waits — Ctrl+C raises KeyboardInterrupt here immediately
    try:
        while not state.shutdown_flag.is_set():
            state.shutdown_flag.wait(timeout=1.0)
    except KeyboardInterrupt:
        pass
    finally:
        logger.info("Shutting down — saving data...")
        state.shutdown_flag.set()
        save_data(state, config)
        candle_emitter.flush_all()
        # Send a proper Polygon close frame so the gateway frees our session
        # slot immediately. Without this, the slot lingers until Polygon's idle
        # timeout (~60-120s) and ghost sessions accumulate across restarts.
        if state.ws_client is not None:
            try:
                asyncio.run(state.ws_client.close())
                logger.info("Polygon WS closed cleanly.")
            except Exception:
                logger.debug("WS close errored", exc_info=True)
        logger.info("Done.")


if __name__ == "__main__":
    main()
