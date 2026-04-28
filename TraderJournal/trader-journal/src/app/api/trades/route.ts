import { NextResponse } from "next/server";
import { readTrades } from "@/lib/excel";

export async function GET() {
  try {
    const trades = await readTrades();
    // Sort: date desc → group by ticker (ordered by ticker's first trade on that date) → entry time asc within ticker
    // Build a map of date+ticker → earliest entry time so all of a ticker's trades stay together
    const firstEntry: Record<string, string> = {};
    for (const t of trades) {
      const key = `${t.Date}__${t.Ticker}`;
      if (!firstEntry[key] || t["Enter Time"] < firstEntry[key]) {
        firstEntry[key] = t["Enter Time"];
      }
    }
    trades.sort((a, b) => {
      // 1. Date descending (most recent day first)
      const dateCompare = b.Date.localeCompare(a.Date);
      if (dateCompare !== 0) return dateCompare;
      // 2. Ticker group: order by earliest trade of that ticker on this date ascending
      const aFirst = firstEntry[`${a.Date}__${a.Ticker}`];
      const bFirst = firstEntry[`${b.Date}__${b.Ticker}`];
      const tickerCompare = aFirst.localeCompare(bFirst);
      if (tickerCompare !== 0) return tickerCompare;
      // 3. Within ticker: entry time ascending
      return a["Enter Time"].localeCompare(b["Enter Time"]);
    });
    return NextResponse.json(trades);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read trades" },
      { status: 500 }
    );
  }
}
