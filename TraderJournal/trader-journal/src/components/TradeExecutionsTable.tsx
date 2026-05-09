"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradeExecutions } from "@/hooks/useTradeExecutions";

function sideClass(side: string): string {
  if (side === "B") return "border-emerald-500/40 text-emerald-400 bg-emerald-500/10";
  return "border-red-500/40 text-red-400 bg-red-500/10";
}

function fmtTime(t: string | null): string {
  if (!t) return "—";
  // Postgres TIME comes back as "HH:MM:SS"; trim the seconds to "HH:MM:SS" stays readable.
  return t.slice(0, 8);
}

export function TradeExecutionsTable({ tradeId }: { tradeId: number }) {
  const { rows: data, error, isLoading } = useTradeExecutions(tradeId);

  if (error) {
    return (
      <div className="text-sm text-red-400">
        Failed to load executions: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-4 border-t border-slate-800">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Executions
        </h3>
        {data && (
          <span className="text-[10px] text-slate-500">
            {data.length} fill{data.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full bg-slate-800" />
      ) : !data || data.length === 0 ? (
        <div className="text-sm text-slate-500">No executions found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700/60 bg-slate-900/40">
          <table className="w-full text-xs font-mono">
            <thead className="bg-slate-800/60 text-slate-400">
              <tr>
                <Th>Time</Th>
                <Th>Side</Th>
                <Th align="right">Price</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Pos Shares</Th>
                <Th align="right">Avg Cost</Th>
                <Th align="right">Pos $</Th>
                <Th align="right">Acc %</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-slate-800/80 hover:bg-slate-800/40"
                >
                  <Td>{fmtTime(row.time)}</Td>
                  <Td>
                    <span
                      className={cn(
                        "inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold",
                        sideClass(row.side)
                      )}
                    >
                      {row.side}
                    </span>
                  </Td>
                  <Td align="right">${row.price.toFixed(4)}</Td>
                  <Td align="right">{row.qty.toLocaleString()}</Td>
                  <Td align="right" className="text-slate-300">
                    {row.runningShares.toLocaleString()}
                  </Td>
                  <Td align="right" className="text-slate-300">
                    {row.avgOpenPrice > 0 ? `$${row.avgOpenPrice.toFixed(4)}` : "—"}
                  </Td>
                  <Td align="right" className="text-slate-300">
                    ${row.posValue.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Td>
                  <Td align="right" className={accPctClass(row.accPct)}>
                    {row.accPct === null ? "—" : `${row.accPct.toFixed(2)}%`}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function accPctClass(pct: number | null): string {
  if (pct === null) return "text-slate-500";
  // Highlight escalating size — yellow at >50%, red at >100% of account-equivalent.
  if (pct >= 100) return "text-red-400";
  if (pct >= 50) return "text-yellow-400";
  return "text-slate-200";
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-3 py-1.5 font-medium uppercase tracking-wider text-[10px]",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-1.5",
        align === "right" ? "text-right" : "text-left",
        className
      )}
    >
      {children}
    </td>
  );
}
