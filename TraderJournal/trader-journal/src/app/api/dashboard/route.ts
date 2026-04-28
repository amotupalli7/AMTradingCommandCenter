import { NextResponse } from "next/server";
import { readTrades, readExecutions } from "@/lib/excel";
import {
  calculateStats,
  getCumulativePnL,
  getDrawdownSeries,
  getPnLBySetup,
  getRDistribution,
} from "@/lib/dashboard";

export async function GET() {
  try {
    const [trades, executions] = await Promise.all([
      readTrades(),
      readExecutions(),
    ]);

    const stats = calculateStats(executions, trades);
    const cumulativePnL = getCumulativePnL(trades);
    const drawdown = getDrawdownSeries(trades);
    const pnlBySetup = getPnLBySetup(trades);
    const rDistribution = getRDistribution(trades);

    return NextResponse.json({
      stats,
      charts: {
        cumulativePnL,
        drawdown,
        pnlBySetup,
        rDistribution,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load dashboard data",
      },
      { status: 500 }
    );
  }
}
