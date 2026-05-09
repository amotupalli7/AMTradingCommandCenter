"""Pure transformations from the raw scanner_v2 JSON into the panel views the UI needs.

Promotion tracking: scanner_v2's snapshot doesn't tell us *when* a ticker first
became a gapper or runner — it just sets `is_gapper=true` and leaves it. So we
remember, in this process, every ticker that has been promoted to gapper or
runner during today's session. Those entries persist in the Alerts panel for the
session (just like HOD alerts persist via `last_hod_alert_minute`), with their
`first_seen_ms` so the UI can sort by recency.

State scope: lives in this module for the lifetime of the backend process. Reset
when the date in the snapshot changes (new trading session), or when the backend
restarts.

We deliberately do NOT add tickers we discover already-promoted on the backend's
very first snapshot read — those are stale gappers from a session that started
before us, not a "fresh" alert. Only tickers we observe transitioning into the
gapper/runner role count.
"""
from __future__ import annotations

import time
from typing import Any

_first_seen_gapper: dict[str, int] = {}
_first_seen_runner: dict[str, int] = {}
_first_seen_date: str | None = None
# Tickers we discovered already-promoted on the very first snapshot. Skipped
# when recording first-seen so the panel doesn't get spammed at backend boot.
_seen_initial: set[str] = set()
_initial_seeded: bool = False


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
    """Single pass: classify each ticker into the appropriate panel(s)."""
    global _first_seen_date, _first_seen_gapper, _first_seen_runner
    global _seen_initial, _initial_seeded

    snap_date = payload.get("date")
    if snap_date != _first_seen_date:
        _first_seen_gapper = {}
        _first_seen_runner = {}
        _seen_initial = set()
        _initial_seeded = False
        _first_seen_date = snap_date

    snapshot: dict[str, Any] = payload.get("data") or {}
    now_ms = int(time.time() * 1000)

    if not _initial_seeded:
        for t, d in snapshot.items():
            if d.get("is_gapper"):
                _seen_initial.add(t)
            else:
                igp = d.get("intraday_gap_pct")
                if igp is not None and igp >= 30:
                    _seen_initial.add(t)
        _initial_seeded = True

    gappers: list[dict[str, Any]] = []
    runners: list[dict[str, Any]] = []
    alerts: list[dict[str, Any]] = []

    for ticker, d in snapshot.items():
        is_gapper = bool(d.get("is_gapper"))
        igp = d.get("intraday_gap_pct")
        is_runner = (not is_gapper) and igp is not None and igp >= 30
        had_hod = d.get("last_hod_alert_minute") is not None
        bs_level = d.get("backside_last_level") or 0

        # Record first-seen for tickers transitioning into a role *after* the
        # initial seed. Tickers in _seen_initial are stale (already promoted
        # before the backend started) and don't generate new-promotion alerts.
        first_seen_ms: int | None = None
        is_new_gapper = False
        is_new_runner = False
        if is_gapper and ticker not in _seen_initial:
            first_seen_ms = _first_seen_gapper.setdefault(ticker, now_ms)
            is_new_gapper = True
        if is_runner and ticker not in _seen_initial:
            first_seen_ms = _first_seen_runner.setdefault(ticker, now_ms)
            is_new_runner = True

        if not (is_gapper or is_runner or had_hod or bs_level > 0):
            continue

        row = _row(ticker, d)
        if is_gapper:
            gappers.append(row)
        elif is_runner:
            runners.append(row)

        kinds: list[str] = []
        if is_new_gapper: kinds.append("new_gapper")
        if is_new_runner: kinds.append("new_runner")
        if had_hod: kinds.append("hod")
        if bs_level > 0: kinds.append("backside")
        if not kinds:
            continue

        alert = dict(row)
        alert["hod_rvol"] = d.get("hod_rvol")
        alert["last_hod_alert_minute"] = d.get("last_hod_alert_minute")
        alert["backside_hod"] = d.get("backside_hod")
        alert["backside_low"] = d.get("backside_low")
        alert["backside_last_level"] = bs_level
        alert["first_seen_ms"] = first_seen_ms
        alert["kinds"] = kinds
        alerts.append(alert)

    gappers.sort(key=lambda r: (r.get("gap_pct") or 0), reverse=True)
    runners.sort(key=lambda r: (r.get("intraday_gap_pct") or 0), reverse=True)
    alerts.sort(key=lambda r: (r.get("first_seen_ms") or 0,
                               r.get("gap_pct") or r.get("intraday_gap_pct") or 0),
                reverse=True)

    return {
        "date": payload.get("date"),
        "gappers": gappers,
        "runners": runners,
        "alerts": alerts,
    }
