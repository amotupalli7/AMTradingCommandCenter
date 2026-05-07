import os
import requests
from scanner_v2.models import ScannerState
from scanner_v2.config import Config


def _discord_enabled() -> bool:
    """Discord webhooks are off by default; the StockScanner web app is the alerting surface now.
    Set ENABLE_DISCORD=1 in the env to restore the old behavior."""
    return os.getenv("ENABLE_DISCORD", "0") == "1"


def send_big_candle_alert(config: Config, ticker: str, candle_open: float, candle_high: float, last_price: float, logger):
    if not _discord_enabled() or not config.big_candle_webhook:
        return
    move_pct = round((candle_high - candle_open) / candle_open * 100, 2)
    message = f"🍆🟩Big Candle: {ticker} +{move_pct:.2f}%🟩🍆"
    try:
        resp = requests.post(config.big_candle_webhook, json={"content": message, "username": "Scanner v2"}, timeout=5)
        resp.raise_for_status()
    except Exception as e:
        logger.error(f"Discord alert failed: {e}")
    logger.info(
        f"[Big Candle] Ticker: {ticker} | High/Open: +{move_pct:.2f}% | "
        f"Open: ${candle_open:.2f} | High: ${candle_high:.2f} | Last: ${last_price:.2f}"
    )


def send_backside_bounce_alert(config: Config, alert: dict, logger):
    if not _discord_enabled() or not config.backside_webhook:
        return
    ticker = alert["ticker"]
    price = alert["price"]
    retrace = alert["retracement_pct"]
    gap_pct = alert.get("gap_pct") or 0
    emoji = {25: "\U0001f7e1", 50: "\U0001f7e0", 75: "\U0001f534"}.get(retrace, "\U0001f4c8")
    message = f"{emoji} BB: {ticker} +{gap_pct:.1f}% | {retrace}% retrace"
    try:
        resp = requests.post(config.backside_webhook, json={"content": message, "username": "Scanner v2"}, timeout=5)
        resp.raise_for_status()
    except Exception as e:
        logger.error(f"Discord alert failed: {e}")
    logger.info(f"[Backside] {ticker} ${price:.2f} +{gap_pct:.1f}% | {retrace}% retrace")


def send_hod_alert(config: Config, alert: dict, logger):
    if not _discord_enabled() or not config.hod_webhook:
        return
    ticker = alert["ticker"]
    price = alert["price"]
    gap_pct = alert.get("gap_pct") or 0
    message = f"🚀 NHOD: {ticker} ${price:.2f} +{gap_pct:.1f}%"
    try:
        resp = requests.post(config.hod_webhook, json={"content": message, "username": "Scanner v2"}, timeout=5)
        resp.raise_for_status()
    except Exception as e:
        logger.error(f"Discord alert failed: {e}")
    logger.info(f"[HOD] {ticker} ${price:.2f} +{gap_pct:.1f}%")


def _send_embed(webhook_url: str, embed: dict, logger):
    try:
        resp = requests.post(webhook_url, json={"embeds": [embed], "username": "Scanner v2"}, timeout=5)
        resp.raise_for_status()
    except Exception as e:
        logger.error(f"Discord alert failed: {e}")


def check_and_alert(state: ScannerState, config: Config):
    """Called each scanner cycle. Sends Discord alerts for any newly qualifying tickers."""
    if not _discord_enabled():
        return
    with state.lock:
        # --- Pre-market gappers (first time is_gapper becomes True) ---
        if config.gap_webhook:
            for ticker, data in state.stock_data.items():
                if ticker in state.alerted_gappers:
                    continue
                last = data.get("last_price") or 0
                dollar_vol = data.get("total_volume", 0) * last
                if (
                    data.get("is_gapper")
                    and data.get("gap_pct") is not None
                    and dollar_vol >= 100_000
                    and last >= 0.15
                ):
                    state.alerted_gappers.add(ticker)
                    pm_high = data.get("premarket_high") or data["last_price"]
                    prev = data["prev_close"]
                    pm_gap = round((pm_high - prev) / prev * 100, 2)
                    vol_m = data.get("total_volume", 0) / 1_000_000
                    embed = {
                        "title": f"Gapper: {ticker} {pm_gap:.2f}%",
                        "color": 0x00FF99,
                        "fields": [
                            {"name": "Type",      "value": "Gapper",                      "inline": True},
                            {"name": "PM Gap %",  "value": f"+{pm_gap:.2f}%",           "inline": True},
                            {"name": "PM High",   "value": f"${pm_high:.2f}",           "inline": True},
                            {"name": "Volume",    "value": f"{vol_m:.2f}M",             "inline": True},
                        ],
                    }
                    _send_embed(config.gap_webhook, embed, state.logger)
                    state.logger.info(
                        f"[Gapper] Ticker: {ticker} | PM Gap %: +{pm_gap:.2f}% | "
                        f"PM High: ${pm_high:.2f} | Volume: {vol_m:.2f}M"
                    )

        # --- Intraday runners (not a gapper, moved 30%+ from open) ---
        if config.runner_webhook:
            for ticker, data in state.stock_data.items():
                if ticker in state.alerted_runners:
                    continue
                if not data.get("is_gapper"):
                    intraday = data.get("intraday_gap_pct")
                    last = data.get("last_price") or 0
                    dollar_vol = data.get("total_volume", 0) * last
                    if intraday is not None and intraday >= 30 and dollar_vol >= 200_000 and last >= 0.15:
                        state.alerted_runners.add(ticker)
                        vol_m = data.get("total_volume", 0) / 1_000_000
                        embed = {
                            "title": f"Runner: {ticker} {intraday:.2f}%",
                            "color": 0x3399FF,
                            "fields": [
                                {"name": "Type",    "value": "Intraday Runner",                       "inline": True},
                                {"name": "Open %",  "value": f"+{intraday:.2f}%",          "inline": True},
                                {"name": "Last",    "value": f"${data['last_price']:.2f}", "inline": True},
                                {"name": "Volume",  "value": f"{vol_m:.2f}M",              "inline": True},
                            ],
                        }
                        _send_embed(config.runner_webhook, embed, state.logger)
                        state.logger.info(
                            f"[Intraday Runner] Ticker: {ticker} | Open %: +{intraday:.2f}% | "
                            f"Last: ${data['last_price']:.2f} | Volume: {vol_m:.2f}M"
                        )
