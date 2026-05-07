"use client";
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { API_BASE, WS_BASE } from "@/lib/api";
import { fmtPrice } from "@/lib/fmt";

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "D";

const TFS: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "D"];

// Lookback per TF. Tuned so each chart has a useful number of bars without overloading
// Polygon backfill on cold reads.
const TF_DAYS: Record<Timeframe, number> = {
  "1m": 2,
  "5m": 5,
  "15m": 30,
  "30m": 60,
  "1h": 180,
  "4h": 365,
  "D": 365 * 3,
};

type RawBar = {
  ts_ms?: number;
  date?: string;
  open: number | null;
  high: number;
  low: number;
  close: number | null;
  volume: number;
};
type Tick = { kind: "tick"; ticker: string; ts_ms: number; price: number; size: number };
type LiveBar = { kind: "bar"; ticker: string; ts_ms: number; o: number; h: number; l: number; c: number; v: number };
type LiveEvent = Tick | LiveBar;

const TF_BUCKET_SECONDS: Record<Timeframe, number> = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "D": 86400,
};

// Bar times come back from the backend as epoch-seconds. We format them in ET because
// that's the trading session timezone. Intraday and daily formatters are different
// because daily axis labels look bad with a "00:00" hour-minute on every tick.
const ET_INTRADAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "numeric", day: "numeric", year: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const ET_DAILY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "numeric", day: "numeric", year: "numeric",
});

function makeFmt(isDaily: boolean) {
  const f = isDaily ? ET_DAILY_FMT : ET_INTRADAY_FMT;
  return (time: Time): string => {
    if (typeof time === "number") {
      const parts = f.formatToParts(new Date(time * 1000));
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      if (isDaily) return `${get("month")}/${get("day")}/${get("year")}`;
      return `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get("minute")}`;
    }
    if (typeof time === "object" && "year" in time) {
      return `${time.month}/${time.day}/${time.year}`;
    }
    return String(time);
  };
}

function rawToTime(b: RawBar): UTCTimestamp | null {
  if (b.ts_ms !== undefined) return Math.floor(b.ts_ms / 1000) as UTCTimestamp;
  if (b.date) return Math.floor(Date.parse(`${b.date}T00:00:00Z`) / 1000) as UTCTimestamp;
  return null;
}

function rawToCandle(b: RawBar): CandlestickData<UTCTimestamp> | null {
  if (b.open === null || b.close === null) return null;
  const time = rawToTime(b);
  if (time === null) return null;
  return { time, open: b.open, high: b.high, low: b.low, close: b.close };
}

function rawToVolume(b: RawBar, isUp: boolean): HistogramData<UTCTimestamp> | null {
  const time = rawToTime(b);
  if (time === null) return null;
  return {
    time, value: b.volume,
    color: isUp ? "rgba(38,208,124,0.5)" : "rgba(239,68,68,0.5)",
  };
}

export function Chart({
  ticker,
  initialTf = "5m",
  onTickerChange,
}: {
  ticker: string | null;
  initialTf?: Timeframe;
  onTickerChange?: (next: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [tf, setTf] = useState<Timeframe>(initialTf);
  const [tickerInput, setTickerInput] = useState(ticker ?? "");
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Active in-progress candle. lightweight-charts' `update()` requires its time
  // to be >= the latest series time, so we also use this as the "last drawn"
  // marker — late ticks (older bucket) are dropped.
  const activeCandleRef = useRef<{
    bucketStart: number;
    open: number; high: number; low: number; close: number;
    volume: number;
  } | null>(null);
  // tf is read inside the WS message handler; using a ref means changing TF
  // doesn't tear down and rebuild the WebSocket (which churned Polygon subs).
  const tfRef = useRef<Timeframe>(tf);
  useEffect(() => { tfRef.current = tf; }, [tf]);
  // historyLoaded is consulted per-message instead of being a WS dep, so the
  // socket stays open while a TF change re-fetches history.
  const historyLoadedRef = useRef(false);
  useEffect(() => { historyLoadedRef.current = historyLoaded; }, [historyLoaded]);

  useEffect(() => setTickerInput(ticker ?? ""), [ticker]);

  // Swap the time formatter when tf changes — daily axis hides the hour:minute.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const isDaily = tf === "D";
    const fmt = makeFmt(isDaily);
    chart.applyOptions({
      timeScale: { timeVisible: !isDaily, tickMarkFormatter: fmt },
      localization: { timeFormatter: fmt },
    });
  }, [tf]);

  // Build the chart once on mount.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: "#0b0d10" }, textColor: "#a8b1bd" },
      grid: { vertLines: { color: "#1d2127" }, horzLines: { color: "#1d2127" } },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#1d2127",
        tickMarkFormatter: makeFmt(false),
      },
      rightPriceScale: { borderColor: "#1d2127", scaleMargins: { top: 0.05, bottom: 0.25 } },
      crosshair: { mode: 1 },
      localization: { timeFormatter: makeFmt(false) },
      autoSize: true,
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#26d07c", downColor: "#ef4444",
      borderUpColor: "#26d07c", borderDownColor: "#ef4444",
      wickUpColor: "#26d07c", wickDownColor: "#ef4444",
    });
    // Volume goes on its own overlay scale at the bottom 20% so it doesn't crush the candles.
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",   // empty string = own overlay scale
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    chartRef.current = chart;
    candleSeriesRef.current = candle;
    volumeSeriesRef.current = volume;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Load history whenever ticker or tf changes.
  useEffect(() => {
    if (!ticker) return;
    const candle = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    if (!candle || !volume) return;

    let cancelled = false;
    setStatus("loading");
    setHistoryLoaded(false);

    const days = TF_DAYS[tf];
    fetch(`${API_BASE}/api/candles/${encodeURIComponent(ticker)}?tf=${tf}&days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error(`http ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const raws: RawBar[] = data.bars ?? [];
        // Build candles + volume in lockstep so indices line up; drop bars with null OHLC.
        const candles: CandlestickData<UTCTimestamp>[] = [];
        const vols: HistogramData<UTCTimestamp>[] = [];
        let prevClose: number | null = null;
        for (const b of raws) {
          const c = rawToCandle(b);
          if (!c) continue;
          const isUp = prevClose === null ? c.close >= c.open : c.close >= prevClose;
          const v = rawToVolume(b, isUp);
          if (!v) continue;
          candles.push(c);
          vols.push(v);
          prevClose = c.close;
        }
        // lightweight-charts requires strictly ascending unique times. Polygon returns
        // ascending order but defensive: drop duplicates by time.
        const dedup = <T extends { time: UTCTimestamp }>(arr: T[]): T[] => {
          const out: T[] = [];
          let last = -Infinity;
          for (const x of arr) {
            const t = x.time as number;
            if (t > last) { out.push(x); last = t; }
          }
          return out;
        };
        const cleanCandles = dedup(candles);
        const cleanVols = dedup(vols);

        candle.setData(cleanCandles);
        volume.setData(cleanVols);

        // Defer fit so the container has been measured at least once.
        requestAnimationFrame(() => chartRef.current?.timeScale().fitContent());

        if (cleanCandles.length > 0) {
          const last = cleanCandles[cleanCandles.length - 1];
          const lastVol = cleanVols[cleanVols.length - 1];
          setLastPrice(last.close);
          activeCandleRef.current = {
            bucketStart: last.time as number,
            open: last.open, high: last.high, low: last.low, close: last.close,
            volume: lastVol.value,
          };
        } else {
          activeCandleRef.current = null;
        }
        setHistoryLoaded(true);
        setStatus("live");
      })
      .catch(() => !cancelled && setStatus("error"));

    return () => { cancelled = true; };
  }, [ticker, tf]);

  // Subscribe to live ticks for the ticker. WS lifetime is keyed only on
  // ticker — TF and historyLoaded are read via refs so flicking timeframes or
  // waiting for history doesn't tear down and reopen the socket. The backend
  // tracks each open WS as a Polygon subscription; needless churn is avoided.
  useEffect(() => {
    if (!ticker) return;
    const ws = new WebSocket(`${WS_BASE}/ws/candles/${encodeURIComponent(ticker)}`);

    ws.onmessage = (ev) => {
      const candle = candleSeriesRef.current;
      const volume = volumeSeriesRef.current;
      // Daily TF doesn't render live ticks; silently ignore until user switches off D.
      if (!candle || !volume || !historyLoadedRef.current || tfRef.current === "D") return;
      const data = JSON.parse(ev.data) as LiveEvent;
      if (data.ticker.toUpperCase() !== ticker.toUpperCase()) return;
      if (data.kind !== "tick") return;

      const tfSec = TF_BUCKET_SECONDS[tfRef.current];
      const tradeSec = Math.floor(data.ts_ms / 1000);
      const bucketStart = Math.floor(tradeSec / tfSec) * tfSec;
      const ac = activeCandleRef.current;
      if (ac && bucketStart < ac.bucketStart) return;
      if (!ac || ac.bucketStart !== bucketStart) {
        activeCandleRef.current = {
          bucketStart,
          open: data.price, high: data.price, low: data.price, close: data.price,
          volume: data.size,
        };
      } else {
        ac.high = Math.max(ac.high, data.price);
        ac.low  = Math.min(ac.low,  data.price);
        ac.close = data.price;
        ac.volume += data.size;
      }
      const cur = activeCandleRef.current!;
      const time = cur.bucketStart as UTCTimestamp;
      candle.update({ time, open: cur.open, high: cur.high, low: cur.low, close: cur.close });
      volume.update({
        time, value: cur.volume,
        color: cur.close >= cur.open ? "rgba(38,208,124,0.5)" : "rgba(239,68,68,0.5)",
      });
      setLastPrice(cur.close);
    };
    ws.onerror = () => setStatus("error");

    return () => ws.close();
  }, [ticker]);

  function applyTickerInput() {
    const next = tickerInput.trim().toUpperCase();
    if (next && next !== ticker) onTickerChange?.(next);
  }

  return (
    <div className="flex flex-col h-full min-h-0 border border-border bg-panel">
      <header className="flex items-center gap-1 px-2 py-1 border-b border-border text-xs">
        <input
          value={tickerInput}
          onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
          onBlur={applyTickerInput}
          onKeyDown={(e) => e.key === "Enter" && applyTickerInput()}
          placeholder="TICKER"
          className="w-20 px-1 py-0.5 bg-bg border border-border font-mono uppercase focus:outline-none focus:border-accent"
        />
        <span className="font-mono text-text">{fmtPrice(lastPrice)}</span>
        <div className="flex-1" />
        <div className="flex">
          {TFS.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-1.5 py-0.5 ${
                tf === t ? "bg-accent/20 text-accent" : "text-muted hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <span
          className={`ml-2 w-2 h-2 rounded-full ${
            status === "live" ? "bg-accent" : status === "loading" ? "bg-warn" : status === "error" ? "bg-danger" : "bg-muted"
          }`}
        />
      </header>
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
