"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChartDataPoint } from "@/lib/types";

interface CumulativePnLProps {
  data: ChartDataPoint[];
}

export function CumulativePnLChart({ data }: CumulativePnLProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        No data available
      </div>
    );
  }

  const lastValue = data[data.length - 1]?.value ?? 0;
  const lineColor = lastValue >= 0 ? "#22c55e" : "#ef4444";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={{ stroke: "#334155" }}
          axisLine={{ stroke: "#334155" }}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={{ stroke: "#334155" }}
          axisLine={{ stroke: "#334155" }}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value) => [`$${Number(value).toFixed(2)}`, "Cumulative P&L"]}
        />
        <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="value"
          stroke={lineColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: lineColor }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
