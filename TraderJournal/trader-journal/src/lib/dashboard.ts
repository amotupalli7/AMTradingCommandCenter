import { Trade, Execution, DashboardStats, ChartDataPoint, SetupPnL, RBin } from "./types";

export function calculateStats(executions: Execution[], trades: Trade[]): DashboardStats {
  // Use unique trades (filter by New Trade = 1 or deduplicate by Trade ID)
  const uniqueTradeIds = new Set<number>();
  const tradeSummaries: { netPnL: number; grossPnL: number; win: number; rNet: number; xScore: number }[] = [];

  for (const exec of executions) {
    if (!uniqueTradeIds.has(exec["Trade ID"])) {
      uniqueTradeIds.add(exec["Trade ID"]);
      tradeSummaries.push({
        netPnL: exec["Net P&L"],
        grossPnL: exec["Gross P&L"],
        win: exec.Win,
        rNet: exec["R Net"],
        xScore: exec["X Score"],
      });
    }
  }

  // If executions don't have unique trade summaries, fall back to trades sheet
  const source = tradeSummaries.length > 0 ? tradeSummaries : trades.map(t => ({
    netPnL: t["Net P&L"],
    grossPnL: t["Net P&L"], // Trades sheet doesn't have Gross P&L
    win: t.Win,
    rNet: t["Net R"],
    xScore: t["X Score"],
  }));

  const totalTrades = source.length;
  const winners = source.filter(t => t.win === 1).length;
  const losers = totalTrades - winners;
  const winRate = totalTrades > 0 ? (winners / totalTrades) * 100 : 0;

  const grossPnL = source.reduce((sum, t) => sum + t.grossPnL, 0);
  const netPnL = source.reduce((sum, t) => sum + t.netPnL, 0);

  const rValues = source.map(t => t.rNet).filter(r => !isNaN(r));
  const avgR = rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0;
  const totalR = rValues.reduce((a, b) => a + b, 0);

  const pnlValues = source.map(t => t.netPnL);
  const maxWin = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
  const maxLoss = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;

  const winnerPnLs = source.filter(t => t.win === 1).map(t => t.netPnL);
  const loserPnLs = source.filter(t => t.win === 0).map(t => t.netPnL);
  const avgWinner = winnerPnLs.length > 0 ? winnerPnLs.reduce((a, b) => a + b, 0) / winnerPnLs.length : 0;
  const avgLoser = loserPnLs.length > 0 ? loserPnLs.reduce((a, b) => a + b, 0) / loserPnLs.length : 0;

  const winnerRs = source.filter(t => t.win === 1).map(t => t.rNet).filter(r => !isNaN(r));
  const loserRs = source.filter(t => t.win === 0).map(t => t.rNet).filter(r => !isNaN(r));
  const avgWinR = winnerRs.length > 0 ? winnerRs.reduce((a, b) => a + b, 0) / winnerRs.length : 0;
  const avgLossR = loserRs.length > 0 ? loserRs.reduce((a, b) => a + b, 0) / loserRs.length : 0;

  const totalWins = winnerPnLs.reduce((a, b) => a + b, 0);
  const totalLosses = Math.abs(loserPnLs.reduce((a, b) => a + b, 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

  // Max drawdown from cumulative P&L
  const cumulativePnL = getCumulativePnL(trades);
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of cumulativePnL) {
    if (point.value > peak) peak = point.value;
    const drawdown = peak - point.value;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const xScores = source.map(t => t.xScore).filter(x => !isNaN(x) && x > 0);
  const avgXScore = xScores.length > 0 ? xScores.reduce((a, b) => a + b, 0) / xScores.length : 0;

  return {
    totalTrades,
    winners,
    losers,
    winRate,
    grossPnL,
    netPnL,
    avgR,
    totalR,
    maxWin,
    maxLoss,
    avgWinner,
    avgLoser,
    avgWinR,
    avgLossR,
    profitFactor,
    maxDrawdown,
    avgXScore,
  };
}

export function getCumulativePnL(trades: Trade[]): ChartDataPoint[] {
  const sorted = [...trades].sort((a, b) => {
    const dateA = new Date(a.Date).getTime();
    const dateB = new Date(b.Date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return a["Enter Time"].localeCompare(b["Enter Time"]);
  });

  let cumulative = 0;
  return sorted.map(t => {
    cumulative += t["Net P&L"];
    return {
      date: t.Date,
      value: parseFloat(cumulative.toFixed(2)),
    };
  });
}

export function getCumulativeR(trades: Trade[]): ChartDataPoint[] {
  const sorted = [...trades].sort((a, b) => {
    const dateA = new Date(a.Date).getTime();
    const dateB = new Date(b.Date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return a["Enter Time"].localeCompare(b["Enter Time"]);
  });

  let cumulative = 0;
  return sorted.map(t => {
    cumulative += t["Net R"];
    return {
      date: t.Date,
      value: parseFloat(cumulative.toFixed(3)),
    };
  });
}

export function getRDrawdownSeries(trades: Trade[]): ChartDataPoint[] {
  const cumR = getCumulativeR(trades);
  let peak = 0;

  return cumR.map(point => {
    if (point.value > peak) peak = point.value;
    const drawdown = point.value - peak; // negative
    return {
      date: point.date,
      value: parseFloat(drawdown.toFixed(3)),
    };
  });
}

export function getDrawdownSeries(trades: Trade[]): ChartDataPoint[] {
  const cumPnL = getCumulativePnL(trades);
  let peak = 0;

  return cumPnL.map(point => {
    if (point.value > peak) peak = point.value;
    const drawdown = point.value - peak; // negative value
    return {
      date: point.date,
      value: parseFloat(drawdown.toFixed(2)),
    };
  });
}

export function getPnLBySetup(trades: Trade[]): SetupPnL[] {
  const grouped: Record<string, { pnl: number; count: number; wins: number }> = {};

  for (const trade of trades) {
    const setup = trade.Setup || "Unknown";
    if (!grouped[setup]) {
      grouped[setup] = { pnl: 0, count: 0, wins: 0 };
    }
    grouped[setup].pnl += trade["Net P&L"];
    grouped[setup].count += 1;
    if (trade.Win === 1) grouped[setup].wins += 1;
  }

  return Object.entries(grouped).map(([setup, data]) => ({
    setup,
    pnl: parseFloat(data.pnl.toFixed(2)),
    count: data.count,
    winRate: data.count > 0 ? parseFloat(((data.wins / data.count) * 100).toFixed(1)) : 0,
  }));
}

export function getRDistribution(trades: Trade[]): RBin[] {
  const rValues = trades.map(t => t["Net R"]).filter(r => !isNaN(r));
  if (rValues.length === 0) return [];

  // Create bins from min to max in 0.5R increments
  const min = Math.floor(Math.min(...rValues) * 2) / 2;
  const max = Math.ceil(Math.max(...rValues) * 2) / 2;

  const bins: RBin[] = [];
  for (let start = min; start < max; start += 0.5) {
    const end = start + 0.5;
    const count = rValues.filter(r => r >= start && r < end).length;
    bins.push({
      range: `${start.toFixed(1)}R`,
      count,
    });
  }

  return bins;
}

export function getDailyR(trades: Trade[]): Record<string, number> {
  const daily: Record<string, number> = {};
  for (const t of trades) {
    if (!t.Date) continue;
    daily[t.Date] = (daily[t.Date] || 0) + t["Net R"];
  }
  return daily;
}
