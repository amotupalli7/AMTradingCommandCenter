"use client";
import { useState } from "react";
import { useScanner } from "@/lib/useScanner";
import { ScannerTable, GapColumns, RunnerColumns, AlertColumns } from "./panels/ScannerTable";
import { StatusBar } from "./panels/StatusBar";
import { ChartGrid } from "./charts/ChartGrid";

type PaneCount = 1 | 2 | 4;

export function Dashboard() {
  const { data, status } = useScanner();
  const [selected, setSelected] = useState<string | null>(null);
  const [paneCount, setPaneCount] = useState<PaneCount>(4);

  const gappers = data?.gappers ?? [];
  const runners = data?.runners ?? [];
  const alerts = data?.alerts ?? [];

  return (
    <div className="h-screen flex flex-col">
      <StatusBar
        status={status}
        date={data?.date ?? null}
        totals={{ gappers: gappers.length, runners: runners.length, alerts: alerts.length }}
      />
      <main className="flex-1 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-1 p-1 min-h-0">
        <aside className="grid grid-rows-3 gap-1 min-h-0 max-h-[40vh] md:max-h-none">
          <ScannerTable
            title="Gap Scanner"
            rows={gappers}
            columns={GapColumns()}
            selected={selected}
            onSelect={setSelected}
            emptyHint="No gappers yet"
          />
          <ScannerTable
            title="Intraday Scanner"
            rows={runners}
            columns={RunnerColumns()}
            selected={selected}
            onSelect={setSelected}
            emptyHint="No intraday runners"
          />
          <ScannerTable
            title="Alerts (HOD + Backside)"
            rows={alerts}
            columns={AlertColumns()}
            selected={selected}
            onSelect={setSelected}
            emptyHint="No alerts fired"
          />
        </aside>

        <section className="flex flex-col min-h-0">
          <div className="flex items-center justify-between px-2 py-1 text-xs text-muted">
            <span>{selected ? `Active: ${selected}` : "Click a ticker to load it into the active pane"}</span>
            <div className="flex gap-1">
              {[1, 2, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setPaneCount(n as PaneCount)}
                  className={`px-2 py-0.5 border border-border ${
                    paneCount === n ? "bg-accent/20 text-accent" : "hover:text-text"
                  }`}
                >
                  {n} pane{n > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <ChartGrid selectedTicker={selected} paneCount={paneCount} />
          </div>
        </section>
      </main>
    </div>
  );
}
