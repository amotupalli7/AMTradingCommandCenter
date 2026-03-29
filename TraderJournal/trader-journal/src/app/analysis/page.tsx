"use client";

import { useTrades } from "@/hooks/useTrades";
import { TradeTable } from "@/components/TradeTable";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalysisPage() {
  const { trades, isLoading, error, refresh } = useTrades();

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-2">
          <p className="text-red-400 text-lg">Failed to load trades</p>
          <p className="text-slate-500 text-sm">
            {error?.message || "Check that trades.xlsx is accessible"}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-64 bg-slate-800" />
          <Skeleton className="h-10 w-32 bg-slate-800" />
          <Skeleton className="h-10 w-32 bg-slate-800" />
        </div>
        <div className="rounded-lg border border-slate-700/50 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full bg-slate-800 mb-px" />
          ))}
        </div>
      </div>
    );
  }

  return <TradeTable trades={trades} onRefresh={refresh} />;
}
