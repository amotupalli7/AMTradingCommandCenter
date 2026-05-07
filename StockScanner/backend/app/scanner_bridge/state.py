"""Pure transformations from the raw scanner_v2 JSON into the panel views the UI needs.

The raw JSON shape (from scanner_v2/persistence.py:save_data) is:
    {"date": "YYYY-MM-DD", "data": {TICKER: {prev_close, last_price, high, total_volume,
                                              gap_pct, intraday_gap_pct, is_gapper,
                                              hod_rvol, last_hod_alert_minute,
                                              backside_hod, backside_low,
                                              backside_last_level, ...}}}
"""
from __future__ import annotations

from typing import Any


def _row(ticker: str, d: dict[str, Any]) -> dict[str, Any]:
    return {
        "ticker": ticker,
        "last_price": d.get("last_price"),
        "prev_close": d.get("prev_close"),
        "open_price": d.get("open_price"),
        "high": d.get("high"),
        "premarket_high": d.get("premarket_high"),
        "total_volume": d.get("total_volume") or 0,
        "gap_pct": d.get("gap_pct"),
        "intraday_gap_pct": d.get("intraday_gap_pct"),
    }


def panels(payload: dict[str, Any]) -> dict[str, Any]:
    """Single pass over the snapshot: classify each ticker into the appropriate
    panel(s). The 12k-ticker dict was previously walked three times — this is one."""
    snapshot: dict[str, Any] = payload.get("data") or {}
    gappers: list[dict[str, Any]] = []
    runners: list[dict[str, Any]] = []
    alerts: list[dict[str, Any]] = []

    for ticker, d in snapshot.items():
        is_gapper = bool(d.get("is_gapper"))
        igp = d.get("intraday_gap_pct")
        had_hod = d.get("last_hod_alert_minute") is not None
        bs_level = d.get("backside_last_level") or 0

        # Skip the dead majority fast — saves the _row() call cost.
        if not (is_gapper or (igp is not None and igp >= 30) or had_hod or bs_level > 0):
            continue

        row = _row(ticker, d)
        if is_gapper:
            gappers.append(row)
        elif igp is not None and igp >= 30:
            runners.append(row)
        if had_hod or bs_level > 0:
            alert = dict(row)
            alert["hod_rvol"] = d.get("hod_rvol")
            alert["last_hod_alert_minute"] = d.get("last_hod_alert_minute")
            alert["backside_hod"] = d.get("backside_hod")
            alert["backside_low"] = d.get("backside_low")
            alert["backside_last_level"] = bs_level
            kinds: list[str] = []
            if had_hod:
                kinds.append("hod")
            if bs_level > 0:
                kinds.append("backside")
            alert["kinds"] = kinds
            alerts.append(alert)

    gappers.sort(key=lambda r: (r.get("gap_pct") or 0), reverse=True)
    runners.sort(key=lambda r: (r.get("intraday_gap_pct") or 0), reverse=True)
    alerts.sort(key=lambda r: (r.get("gap_pct") or r.get("intraday_gap_pct") or 0), reverse=True)

    return {
        "date": payload.get("date"),
        "gappers": gappers,
        "runners": runners,
        "alerts": alerts,
    }
