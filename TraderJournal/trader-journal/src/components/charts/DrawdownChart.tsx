"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartDataPoint } from "@/lib/types";

interface DrawdownChartProps {
  data: ChartDataPoint[];
}

export function DrawdownChart({ data }: DrawdownChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
          formatter={(value) => [`$${Number(value).toFixed(2)}`, "Drawdown"]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#ef4444"
          fill="#ef4444"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
