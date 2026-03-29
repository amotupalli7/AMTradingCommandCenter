"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { RBin } from "@/lib/types";

interface RDistributionProps {
  data: RBin[];
}

export function RDistributionChart({ data }: RDistributionProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="range"
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={{ stroke: "#334155" }}
          axisLine={{ stroke: "#334155" }}
          interval={0}
          angle={-45}
          textAnchor="end"
          height={50}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={{ stroke: "#334155" }}
          axisLine={{ stroke: "#334155" }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value) => [value, "Trades"]}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={
                parseFloat(entry.range) >= 0 ? "#22c55e" : "#ef4444"
              }
              fillOpacity={0.6}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
