"use client";
import { useEffect, useRef, useState } from "react";
import { API_BASE, WS_BASE, type ScannerPanels } from "./api";

export type ScannerStatus = "connecting" | "live" | "polling" | "error";

export function useScanner() {
  const [data, setData] = useState<ScannerPanels | null>(null);
  const [status, setStatus] = useState<ScannerStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // The backend already diffs identical projections before broadcasting, but
  // the polling fallback hits a different code path (REST), so guard here too.
  const lastJsonRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function applyRaw(raw: string) {
      if (raw === lastJsonRef.current) return;
      lastJsonRef.current = raw;
      try { setData(JSON.parse(raw)); } catch {}
    }

    fetch(`${API_BASE}/api/scanner/state`)
      .then((r) => (r.ok ? r.text() : null))
      .then((raw) => { if (!cancelled && raw) applyRaw(raw); })
      .catch(() => {});

    function startPolling() {
      if (pollTimer.current) return;
      setStatus("polling");
      pollTimer.current = setInterval(async () => {
        try {
          const r = await fetch(`${API_BASE}/api/scanner/state`);
          if (r.ok) applyRaw(await r.text());
        } catch {}
      }, 5000);
    }

    function stopPolling() {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    }

    function connect() {
      const ws = new WebSocket(`${WS_BASE}/ws/scanner`);
      wsRef.current = ws;
      ws.onopen = () => {
        stopPolling();
        setStatus("live");
      };
      ws.onmessage = (ev) => applyRaw(ev.data);
      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        wsRef.current = null;
        if (cancelled) return;
        startPolling();
        setTimeout(() => { if (!cancelled) connect(); }, 3000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      stopPolling();
      wsRef.current?.close();
    };
  }, []);

  return { data, status };
}
