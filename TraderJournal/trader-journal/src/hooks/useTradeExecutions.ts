"use client";

import useSWR from "swr";

export interface TradeExecutionRow {
  id: number;
  date: string;
  time: string | null;
  side: string;
  price: number;
  qty: number;
  route: string;
  runningShares: number;
  avgOpenPrice: number;
  posValue: number;
  accPct: number | null;
}

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load executions");
    return res.json() as Promise<TradeExecutionRow[]>;
  });

export function useTradeExecutions(tradeId: number | null | undefined) {
  const { data, error, isLoading } = useSWR(
    tradeId ? `/api/trade/${tradeId}/executions` : null,
    fetcher
  );

  // Peak Acc % across the trade — i.e. the largest position size carried,
  // expressed as a multiple of R ($ Risk = 1% of account).
  const peakAccPct =
    data && data.length > 0
      ? data.reduce<number | null>((max, row) => {
          if (row.accPct === null) return max;
          return max === null || row.accPct > max ? row.accPct : max;
        }, null)
      : null;

  return { rows: data, peakAccPct, isLoading, error };
}
