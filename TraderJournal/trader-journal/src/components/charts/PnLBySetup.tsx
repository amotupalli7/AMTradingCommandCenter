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
import { SetupPnL } from "@/lib/types";

interface PnLBySetupProps {
  data: SetupPnL[];
}

export function PnLBySetupChart({ data }: PnLBySetupProps) {
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
          dataKey="setup"
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, _name: any, props: any) => [
            `$${Number(value).toFixed(2)} (${props?.payload?.count ?? 0} trades, ${props?.payload?.winRate ?? 0}% WR)`,
            "P&L",
          ]}
        />
        <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"}
              fillOpacity={0.7}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
