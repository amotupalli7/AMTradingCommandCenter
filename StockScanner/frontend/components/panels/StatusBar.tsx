"use client";
import type { ScannerStatus } from "@/lib/useScanner";

export function StatusBar({
  status,
  date,
  totals,
}: {
  status: ScannerStatus;
  date: string | null;
  totals: { gappers: number; runners: number; alerts: number };
}) {
  const dotColor =
    status === "live"
      ? "bg-accent"
      : status === "polling"
      ? "bg-warn"
      : status === "error"
      ? "bg-danger"
      : "bg-muted";
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-panel text-xs text-muted">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="capitalize">{status}</span>
        <span className="text-muted/60">·</span>
        <span>{date ?? "—"}</span>
      </div>
      <div className="flex items-center gap-3">
        <span>Gap: {totals.gappers}</span>
        <span>Run: {totals.runners}</span>
        <span>Alert: {totals.alerts}</span>
      </div>
    </div>
  );
}
