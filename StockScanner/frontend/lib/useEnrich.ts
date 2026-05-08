"use client";
import { useEffect, useState } from "react";
import { API_BASE, type DTPayload, type EdgarPayload } from "./api";

type Status = "idle" | "loading" | "ready" | "error";

export function useEnrich(ticker: string | null) {
  const [edgar, setEdgar] = useState<EdgarPayload | null>(null);
  const [edgarStatus, setEdgarStatus] = useState<Status>("idle");
  const [dt, setDt] = useState<DTPayload | null>(null);
  const [dtStatus, setDtStatus] = useState<Status>("idle");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!ticker) {
      setEdgar(null); setDt(null);
      setEdgarStatus("idle"); setDtStatus("idle");
      return;
    }
    let cancelled = false;

    setEdgarStatus("loading");
    fetch(`${API_BASE}/api/enrich/${encodeURIComponent(ticker)}/edgar${refreshKey ? "?refresh=true" : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setEdgar(d);
        setEdgarStatus(d ? "ready" : "error");
      })
      .catch(() => { if (!cancelled) setEdgarStatus("error"); });

    setDtStatus("loading");
    fetch(`${API_BASE}/api/enrich/${encodeURIComponent(ticker)}/dt`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setDt(d);
        setDtStatus(d ? "ready" : "error");
      })
      .catch(() => { if (!cancelled) setDtStatus("error"); });

    return () => { cancelled = true; };
  }, [ticker, refreshKey]);

  return {
    edgar, edgarStatus,
    dt, dtStatus,
    refresh: () => setRefreshKey((k) => k + 1),
  };
}
