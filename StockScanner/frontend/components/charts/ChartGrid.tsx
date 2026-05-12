"use client";
import { useEffect, useState } from "react";
import { Chart, type Timeframe } from "./Chart";

type Pane = { ticker: string | null; tf: Timeframe };

const STORAGE_KEY = "stockscanner:panes";

const DEFAULTS: Pane[] = [
  { ticker: null, tf: "5m" },
  { ticker: null, tf: "1m" },
  { ticker: null, tf: "15m" },
  { ticker: null, tf: "D"  },
];

export function ChartGrid({
  selectedTicker,
  paneCount,
}: {
  selectedTicker: string | null;
  paneCount: 1 | 2 | 4;
}) {
  const [panes, setPanes] = useState<Pane[]>(DEFAULTS);
  const [activePane, setActivePane] = useState(0);

  // Restore panes from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPanes(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(panes)); } catch {}
  }, [panes]);

  // When the user clicks a ticker in the scanner panel, load it into the *active* pane.
  useEffect(() => {
    if (!selectedTicker) return;
    setPanes((cur) => {
      const next = [...cur];
      next[activePane] = { ...next[activePane], ticker: selectedTicker };
      return next;
    });
  }, [selectedTicker]); // eslint-disable-line react-hooks/exhaustive-deps

  function setPaneTicker(i: number, ticker: string | null) {
    setPanes((cur) => {
      const next = [...cur];
      next[i] = { ...next[i], ticker };
      return next;
    });
  }

  const visible = panes.slice(0, paneCount);
  const gridClass =
    paneCount === 1 ? "grid-cols-1 grid-rows-1" :
    paneCount === 2 ? "grid-cols-2 grid-rows-1" :
                      "grid-cols-2 grid-rows-2";

  return (
    <div className={`grid gap-1 h-full min-h-0 ${gridClass}`}>
      {visible.map((p, i) => (
        <div
          key={i}
          onMouseDown={() => setActivePane(i)}
          className={`relative min-h-0 ${activePane === i ? "ring-1 ring-accent/60" : ""}`}
        >
          <Chart
            ticker={p.ticker}
            initialTf={p.tf}
            onTickerChange={(t) => setPaneTicker(i, t)}
          />
        </div>
      ))}
    </div>
  );
}
