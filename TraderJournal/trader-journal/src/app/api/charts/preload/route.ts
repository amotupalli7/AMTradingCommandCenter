import { NextResponse } from "next/server";
import { readTrades } from "@/lib/excel";
import {
  getChartPath,
  setChartPath,
  findLocalChartFilename,
  getCachedImagePath,
} from "@/lib/images";

/**
 * Resolve all trade chart paths at once.
 * Returns { [tradeId]: "/api/charts/filename.png" | "/api/trade/{id}/image" }
 *
 * Local charts get the fast /api/charts/ path.
 * Dropbox-cached charts get the fast /api/charts/ path (via chart-cache folder).
 * Unresolved charts fall back to the per-trade image route (which will download on demand).
 */
export async function GET() {
  try {
    const trades = await readTrades();
    const urls: Record<number, string> = {};

    for (const trade of trades) {
      const tradeId = trade["Trade ID"];

      // 1. Already in path index?
      const indexed = getChartPath(tradeId);
      if (indexed) {
        urls[tradeId] = `/api/charts/${encodeURIComponent(indexed)}`;
        continue;
      }

      // 2. Try local execution chart
      const localFilename = findLocalChartFilename(trade.Date, trade.Ticker);
      if (localFilename) {
        setChartPath(tradeId, localFilename);
        urls[tradeId] = `/api/charts/${encodeURIComponent(localFilename)}`;
        continue;
      }

      // 3. Check if Dropbox image is already cached locally
      if (trade.Chart) {
        const cachedPath = getCachedImagePath(trade.Chart);
        if (cachedPath) {
          urls[tradeId] = `/api/trade/${tradeId}/image`;
          continue;
        }
      }

      // 4. Not yet available — frontend can lazy-load via the per-trade route
      if (trade.Chart) {
        urls[tradeId] = `/api/trade/${tradeId}/image`;
      }
    }

    return NextResponse.json(urls, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to preload" },
      { status: 500 }
    );
  }
}
