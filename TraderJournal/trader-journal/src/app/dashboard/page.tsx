"use client";

import { useMemo } from "react";
import { useTrades } from "@/hooks/useTrades";
import { useFilters } from "@/context/FilterContext";
import { StatsCard } from "@/components/StatsCard";

import { CumulativePnLChart } from "@/components/charts/CumulativePnL";
import { DrawdownChart } from "@/components/charts/DrawdownChart";
import { CumulativeRChart } from "@/components/charts/CumulativeR";
import { RDrawdownChart } from "@/components/charts/RDrawdown";
import { PnLBySetupChart } from "@/components/charts/PnLBySetup";
import { RDistributionChart } from "@/components/charts/RDistribution";
import { RCalendar } from "@/components/charts/RCalendar";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterBar, applyTradeFilters } from "@/components/FilterBar";
import {
  calculateStats,
  getCumulativePnL,
  getDrawdownSeries,
  getCumulativeR,
  getRDrawdownSeries,
  getPnLBySetup,
  getRDistribution,
  getDailyR,
} from "@/lib/dashboard";

export default function DashboardPage() {
  const { trades, isLoading, error } = useTrades();
  const { filters, setFilters } = useFilters();

  const filteredTrades = useMemo(
    () => applyTradeFilters(trades, filters),
    [trades, filters]
  );

  // Calendar uses non-date filters so all days remain visible for navigation
  const calendarTrades = useMemo(
    () => applyTradeFilters(trades, { ...filters, dateFrom: "", dateTo: "" }),
    [trades, filters]
  );
  const dailyR = useMemo(() => getDailyR(calendarTrades), [calendarTrades]);

  // Compute all stats/charts from filtered trades (client-side, no executions needed)
  const stats = useMemo(
    () => (filteredTrades.length > 0 ? calculateStats([], filteredTrades) : null),
    [filteredTrades]
  );
  const charts = useMemo(() => {
    if (filteredTrades.length === 0) return null;
    return {
      cumulativePnL: getCumulativePnL(filteredTrades),
      drawdown: getDrawdownSeries(filteredTrades),
      cumulativeR: getCumulativeR(filteredTrades),
      rDrawdown: getRDrawdownSeries(filteredTrades),
      pnlBySetup: getPnLBySetup(filteredTrades),
      rDistribution: getRDistribution(filteredTrades),
    };
  }, [filteredTrades]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-2">
          <p className="text-red-400 text-lg">Failed to load dashboard</p>
          <p className="text-slate-500 text-sm">
            {error?.message || "Check that trades.xlsx is accessible"}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-20 bg-slate-800 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-80 bg-slate-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <FilterBar
        trades={trades}
        filters={filters}
        onChange={setFilters}
        totalCount={trades.length}
        filteredCount={filteredTrades.length}
      />

      {filteredTrades.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
          No trades match the current filters
        </div>
      ) : stats ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatsCard label="Total Trades" value={String(stats.totalTrades)} />
            <StatsCard
              label="Win Rate"
              value={`${stats.winRate.toFixed(1)}%`}
              colorClass={stats.winRate >= 50 ? "text-emerald-400" : "text-red-400"}
            />
            <StatsCard
              label="Net P&L"
              value={`$${stats.netPnL.toFixed(2)}`}
              colorClass={stats.netPnL >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <StatsCard
              label="Net R"
              value={`${stats.totalR.toFixed(2)}R`}
              colorClass={stats.totalR >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <StatsCard
              label="Avg R"
              value={`${stats.avgR.toFixed(2)}R`}
              colorClass={stats.avgR >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <StatsCard
              label="Profit Factor"
              value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
              colorClass={stats.profitFactor >= 1 ? "text-emerald-400" : "text-red-400"}
            />
            <StatsCard
              label="Gross P&L"
              value={`$${stats.grossPnL.toFixed(2)}`}
              colorClass={stats.grossPnL >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <StatsCard
              label="Max Drawdown $"
              value={`$${stats.maxDrawdown.toFixed(2)}`}
              colorClass="text-red-400"
            />
            <StatsCard
              label="Avg Win R"
              value={`${stats.avgWinR.toFixed(2)}R`}
              colorClass="text-emerald-400"
            />
            <StatsCard
              label="Avg Loss R"
              value={`${stats.avgLossR.toFixed(2)}R`}
              colorClass="text-red-400"
            />
            <StatsCard
              label="Avg Win $"
              value={`$${stats.avgWinner.toFixed(2)}`}
              colorClass="text-emerald-400"
            />
            <StatsCard
              label="Avg Loss $"
              value={`$${stats.avgLoser.toFixed(2)}`}
              colorClass="text-red-400"
            />
            <StatsCard
              label="Avg X Score"
              value={`${(stats.avgXScore * 100).toFixed(0)}%`}
              colorClass={
                stats.avgXScore >= 0.8
                  ? "text-emerald-400"
                  : stats.avgXScore >= 0.5
                    ? "text-yellow-400"
                    : "text-red-400"
              }
            />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2">
              <ChartPanel title="Daily R Calendar">
                <RCalendar data={dailyR} />
              </ChartPanel>
            </div>
            <ChartPanel title="Cumulative R">
              <CumulativeRChart data={charts?.cumulativeR || []} />
            </ChartPanel>
            <ChartPanel title="R Drawdown">
              <RDrawdownChart data={charts?.rDrawdown || []} />
            </ChartPanel>
            <ChartPanel title="Cumulative P&L">
              <CumulativePnLChart data={charts?.cumulativePnL || []} />
            </ChartPanel>
            <ChartPanel title="Drawdown ($)">
              <DrawdownChart data={charts?.drawdown || []} />
            </ChartPanel>
            <ChartPanel title="P&L by Setup">
              <PnLBySetupChart data={charts?.pnlBySetup || []} />
            </ChartPanel>
            <ChartPanel title="R Distribution">
              <RDistributionChart data={charts?.rDistribution || []} />
            </ChartPanel>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ChartPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/60 rounded-lg border border-slate-700/50 p-5">
      <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}
