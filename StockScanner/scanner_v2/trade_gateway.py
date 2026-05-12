"""Local TCP trade gateway.

scanner_v2 owns the only Polygon WebSocket connection (T.* firehose). Other
processes that need live trades — currently just the backend's live_hub for
chart panes — connect here instead of opening their own Polygon WS, which
would trip Polygon's one-connection-per-API-key limit and get 1008 rejects.

Wire format: newline-delimited JSON, one trade per line.
    {"s": "AAPL", "p": 191.23, "z": 100, "t": 1735659600123, "c": [0]}

Field names are single-char to keep the wire payload small (firehose volume
can hit thousands of trades per second around market open).

Filtering: BAD_CONDITIONS are dropped at the gateway, since every downstream
consumer drops them anyway and it cuts bandwidth.

Backpressure: each client gets a bounded queue. If the client falls behind,
the oldest trades are dropped — a chart that briefly skips a tick is much
better than scanner_v2 blocking on its hot path.
"""
from __future__ import annotations

import json
import logging
import socket
import threading
from typing import Iterable

from scanner_v2.ingest import BAD_CONDITIONS

logger = logging.getLogger(__name__)

# Backpressure: a client this far behind gets the oldest trade dropped. Each
# trade is ~80 bytes encoded, so 4096 ≈ 320KB per slow client in the worst case.
_CLIENT_QUEUE_MAX = 4096


class _Client:
    """A connected subscriber. Owns the socket and a sender thread.

    The sender thread reads from an in-memory deque and writes to the socket so
    that the gateway's publish() never blocks on a slow client. If the deque
    overflows we drop the oldest trade and bump a counter — better than
    backpressuring the trade hot path.
    """

    __slots__ = ("sock", "addr", "lock", "buf", "cond", "alive", "dropped")

    def __init__(self, sock: socket.socket, addr) -> None:
        self.sock = sock
        self.addr = addr
        self.lock = threading.Lock()
        self.buf: list[bytes] = []
        self.cond = threading.Condition(self.lock)
        self.alive = True
        self.dropped = 0

    def push(self, line: bytes) -> None:
        with self.cond:
            if len(self.buf) >= _CLIENT_QUEUE_MAX:
                # Drop oldest. Newer ticks are more useful to the chart than ancient ones.
                self.buf.pop(0)
                self.dropped += 1
            self.buf.append(line)
            self.cond.notify()

    def run_writer(self) -> None:
        try:
            while self.alive:
                with self.cond:
                    while self.alive and not self.buf:
                        self.cond.wait()
                    if not self.alive:
                        return
                    chunk = b"".join(self.buf)
                    self.buf.clear()
                try:
                    self.sock.sendall(chunk)
                except OSError:
                    self.alive = False
                    return
        finally:
            try:
                self.sock.close()
            except OSError:
                pass


class TradeGateway:
    def __init__(self, host: str = "127.0.0.1", port: int = 8765) -> None:
        self.host = host
        self.port = port
        self._clients: set[_Client] = set()
        self._clients_lock = threading.Lock()
        self._server_sock: socket.socket | None = None
        self._stop = threading.Event()

    def start(self) -> None:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((self.host, self.port))
        s.listen(8)
        # 1s accept timeout so the loop checks self._stop periodically.
        s.settimeout(1.0)
        self._server_sock = s
        threading.Thread(target=self._accept_loop, name="trade-gateway-accept",
                         daemon=True).start()
        logger.info("trade gateway listening on %s:%d", self.host, self.port)

    def stop(self) -> None:
        self._stop.set()
        s = self._server_sock
        if s is not None:
            try: s.close()
            except OSError: pass
        with self._clients_lock:
            clients = list(self._clients)
            self._clients.clear()
        for c in clients:
            c.alive = False
            with c.cond:
                c.cond.notify_all()

    def _accept_loop(self) -> None:
        assert self._server_sock is not None
        while not self._stop.is_set():
            try:
                sock, addr = self._server_sock.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            client = _Client(sock, addr)
            with self._clients_lock:
                self._clients.add(client)
            threading.Thread(target=self._client_lifecycle, args=(client,),
                             name=f"trade-gateway-client-{addr[1]}",
                             daemon=True).start()
            logger.info("trade gateway: client connected from %s", addr)

    def _client_lifecycle(self, client: _Client) -> None:
        try:
            client.run_writer()
        finally:
            with self._clients_lock:
                self._clients.discard(client)
            logger.info("trade gateway: client %s disconnected (dropped=%d)",
                        client.addr, client.dropped)

    def handle_trades(self, msgs: Iterable) -> None:
        """extra_handlers callback. Called once per WS batch on scanner_v2's hot path.

        Keep this cheap: build encoded lines once, push to every client's queue,
        return. Socket I/O happens on the per-client writer threads.
        """
        with self._clients_lock:
            if not self._clients:
                return
            clients = list(self._clients)

        encoded: list[bytes] = []
        for msg in msgs:
            conds = getattr(msg, "conditions", None)
            if conds and any(c in BAD_CONDITIONS for c in conds):
                continue
            symbol = getattr(msg, "symbol", None)
            price = getattr(msg, "price", None)
            ts = getattr(msg, "timestamp", None)
            if symbol is None or price is None or ts is None:
                continue
            size = getattr(msg, "size", None) or 0
            payload = {"s": symbol, "p": float(price), "z": int(size), "t": int(ts)}
            if conds:
                # Keep conditions so downstream consumers can do their own filtering
                # if needed (e.g. for stricter sets than BAD_CONDITIONS).
                payload["c"] = list(conds)
            encoded.append(json.dumps(payload, separators=(",", ":")).encode() + b"\n")

        if not encoded:
            return
        blob = b"".join(encoded)
        for c in clients:
            c.push(blob)
