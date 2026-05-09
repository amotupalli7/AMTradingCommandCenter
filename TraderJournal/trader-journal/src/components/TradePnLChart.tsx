"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartFill {
  ts: number;
  side: string;
  price: number;
  qty: number;
  isOpenSide: boolean;
}

interface ChartBar {
  ts: number;
  price: number;
  runningShares: number;
  avgOpenPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalR: number | null;
}

interface ChartPayload {
  ticker: string;
  direction: "Long" | "Short";
  dollarRisk: number | null;
  bars: ChartBar[];
  fills: ChartFill[];
  mfe: number;
  mae: number;
  mfeR: number | null;
  maeR: number | null;
  source: "polygon" | "empty";
}

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) return res.json().then((j) => Promise.reject(new Error(j.error || "Failed")));
    return res.json() as Promise<ChartPayload>;
  });

type ViewMode = "pnl" | "r" | "price";

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
    hour12: false,
  });
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function TradePnLChart({ tradeId }: { tradeId: number }) {
  const { data, error, isLoading } = useSWR(
    `/api/trade/${tradeId}/chart`,
    fetcher
  );
  const [view, setView] = useState<ViewMode>("pnl");

  const series = useMemo(() => {
    if (!data) return [];
    return data.bars.map((b) => ({
      ts: b.ts,
      pnl: b.totalPnl,
      r: b.totalR,
      price: b.price,
      shares: Math.abs(b.runningShares),
    }));
  }, [data]);

  if (error) {
    return (
      <div className="text-sm text-red-400">
        Failed to load chart: {error.message}
      </div>
    );
  }
  if (isLoading || !data) {
    return <Skeleton className="h-72 w-full bg-slate-800" />;
  }
  if (data.source === "empty" || series.length === 0) {
    return (
      <div className="text-sm text-slate-500">
        No bars available for this trade window.
      </div>
    );
  }

  const yKey = view === "pnl" ? "pnl" : view === "r" ? "r" : "price";
  const lineColor =
    view === "price" ? "#94a3b8" : data.mfe + data.mae >= 0 ? "#34d399" : "#f87171";

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 text-xs">
          <ToggleBtn active={view === "pnl"} onClick={() => setView("pnl")}>
            $ P&amp;L
          </ToggleBtn>
          <ToggleBtn
            active={view === "r"}
            onClick={() => setView("r")}
            disabled={data.dollarRisk === null}
            title={data.dollarRisk === null ? "Set $ Risk to see R" : undefined}
          >
            R
          </ToggleBtn>
          <ToggleBtn active={view === "price"} onClick={() => setView("price")}>
            Price
          </ToggleBtn>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <Stat label="MFE" value={fmtMoney(data.mfe)} sub={data.mfeR === null ? null : `${data.mfeR.toFixed(2)}R`} cls="text-emerald-400" />
          <Stat label="MAE" value={fmtMoney(data.mae)} sub={data.maeR === null ? null : `${data.maeR.toFixed(2)}R`} cls="text-red-400" />
        </div>
      </div>

      {/* Chart */}
      <div className="h-72 rounded-lg border border-slate-700/60 bg-slate-900/40 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 10, right: 50, bottom: 5, left: 10 }}>
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={fmtTime}
              stroke="#475569"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
            />
            <YAxis
              yAxisId="primary"
              stroke="#475569"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickFormatter={(v: number) => {
                if (view === "pnl") return `$${Math.round(v)}`;
                if (view === "r") return `${v.toFixed(1)}R`;
                return `$${v.toFixed(2)}`;
              }}
            />
            {/* Right axis for the position size area */}
            <YAxis
              yAxisId="size"
              orientation="right"
              stroke="#334155"
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickFormatter={(v: number) => v.toLocaleString()}
            />

            {/* Position-size area (drawn first so the line sits on top) */}
            <Area
              yAxisId="size"
              type="stepAfter"
              dataKey="shares"
              stroke="none"
              fill="#3b82f6"
              fillOpacity={0.12}
              isAnimationActive={false}
            />

            {/* Zero reference for P&L modes */}
            {view !== "price" && (
              <ReferenceLine y={0} yAxisId="primary" stroke="#475569" strokeDasharray="3 3" />
            )}

            <Line
              yAxisId="primary"
              type="monotone"
              dataKey={yKey}
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />

            {/* Fill markers — only meaningful on the price view, but show on all */}
            {data.fills.map((f, i) => {
              const yValue =
                view === "price"
                  ? f.price
                  : findValueAt(series, f.ts, view === "r" ? "r" : "pnl");
              if (yValue === null) return null;
              const color = f.isOpenSide ? "#34d399" : "#f87171";
              return (
                <ReferenceDot
                  key={i}
                  yAxisId="primary"
                  x={f.ts}
                  y={yValue}
                  r={4}
                  fill={color}
                  stroke="#0f172a"
                  strokeWidth={1}
                  ifOverflow="extendDomain"
                />
              );
            })}

            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
              }}
              labelFormatter={(v) => fmtTime(v as number)}
              formatter={(value, key) => {
                const k = String(key ?? "");
                if (value === undefined || value === null) return ["—", k];
                const n = Number(value);
                if (k === "shares") return [n.toLocaleString(), "Shares"];
                if (k === "pnl") return [fmtMoney(n), "P&L"];
                if (k === "r") return [`${n.toFixed(2)}R`, "R"];
                if (k === "price") return [`$${n.toFixed(2)}`, "Price"];
                return [String(n), k];
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function findValueAt(
  series: { ts: number; pnl: number; r: number | null; price: number }[],
  ts: number,
  key: "pnl" | "r"
): number | null {
  // Use the bar whose ts is closest to and not after the fill.
  let best: number | null = null;
  for (const row of series) {
    if (row.ts <= ts) {
      const v = key === "pnl" ? row.pnl : row.r;
      if (v !== null && v !== undefined) best = v;
    } else break;
  }
  return best;
}

function ToggleBtn({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "px-2 py-1 rounded border text-xs font-medium transition-colors",
        disabled
          ? "border-slate-800 text-slate-600 cursor-not-allowed"
          : active
            ? "border-blue-500/60 bg-blue-500/15 text-blue-300"
            : "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
      )}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  sub,
  cls,
}: {
  label: string;
  value: string;
  sub: string | null;
  cls: string;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className={cn("font-semibold", cls)}>{value}</span>
      {sub && <span className="text-slate-500">({sub})</span>}
    </div>
  );
}
