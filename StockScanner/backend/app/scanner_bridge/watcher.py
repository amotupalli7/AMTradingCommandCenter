"""Watch scanner_v2/logs/scanner_data.json for changes and broadcast panel views.

scanner_v2 writes the file atomically (temp + rename) every ~30s, so each change is
a complete new snapshot. We re-read on every change, project to panel views, and
push to all connected WebSocket clients.
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from watchfiles import awatch

from . import state as state_proj

logger = logging.getLogger(__name__)


class ScannerHub:
    """Pub/sub for the latest panel snapshot. WS clients subscribe; the watcher publishes."""

    def __init__(self, data_file: Path):
        self.data_file = data_file
        self.latest: dict[str, Any] | None = None
        self._latest_serialized: str | None = None
        self._subscribers: set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=4)
        async with self._lock:
            self._subscribers.add(q)
        if self.latest is not None:
            await _safe_put(q, self.latest)
        return q

    async def unsubscribe(self, q: asyncio.Queue) -> None:
        async with self._lock:
            self._subscribers.discard(q)

    async def publish(self, payload: dict[str, Any]) -> None:
        # Diff-before-broadcast. scanner_v2 rewrites scanner_data.json every 30s
        # even when nothing changed in promoted tickers, so most file events
        # produce an identical projection. Skipping equal payloads avoids re-
        # rendering every chart pane on the connected clients for no reason.
        serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        if serialized == self._latest_serialized:
            return
        self.latest = payload
        self._latest_serialized = serialized
        async with self._lock:
            subs = list(self._subscribers)
        for q in subs:
            await _safe_put(q, payload)

    def read_now(self) -> dict[str, Any] | None:
        """Synchronous one-shot read for REST endpoints."""
        try:
            raw = json.loads(self.data_file.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except json.JSONDecodeError:
            return self.latest  # mid-write race; reuse last good snapshot
        return state_proj.panels(raw)


async def _safe_put(q: asyncio.Queue, item: Any) -> None:
    """Drop oldest if a slow client backs up — we're broadcasting full state, never deltas."""
    try:
        q.put_nowait(item)
    except asyncio.QueueFull:
        try:
            q.get_nowait()
        except asyncio.QueueEmpty:
            pass
        try:
            q.put_nowait(item)
        except asyncio.QueueFull:
            pass


async def run_watcher(hub: ScannerHub) -> None:
    """Background task: prime once, then publish on every file change."""
    initial = hub.read_now()
    if initial is not None:
        await hub.publish(initial)
        logger.info("primed scanner panels from %s", hub.data_file)
    else:
        logger.warning("scanner data file not found at %s (will pick up when it appears)", hub.data_file)

    target = str(hub.data_file.resolve())
    target_tmp = target + ".tmp"  # scanner_v2 writes .tmp then renames
    while True:
        try:
            async for changes in awatch(hub.data_file.parent, recursive=False, step=250):
                # Only respond to changes on the actual data file (the parent dir
                # holds rotating logs that fire frequent unrelated events).
                paths = {str(Path(p).resolve()) for _, p in changes}
                if not (paths & {target, target_tmp}):
                    continue
                payload = hub.read_now()
                if payload is not None:
                    await hub.publish(payload)
        except Exception:
            logger.exception("scanner watcher crashed; restarting in 2s")
            await asyncio.sleep(2)
