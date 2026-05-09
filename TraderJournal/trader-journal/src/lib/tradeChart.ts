/**
 * Per-trade P&L chart data builder.
 *
 * Pulls the trade's executions, fetches Polygon 1m aggs for the trade window
 * (padded by 15 minutes either side), and walks bars + fills together to
 * produce a row-per-bar series with running realized + unrealized P&L, R,
 * and position size. Also computes MFE / MAE from the same series.
 */
import { query } from "./db";
import { fetchMinuteAggs, etDateTimeToUtcMs, MinuteBar } from "./polygon";

const PAD_MS = 15 * 60 * 1000; // 15 minutes either side

export interface ChartFill {
  ts: number;          // UTC ms
  side: string;        // "B" / "S" / "SS"
  price: number;
  qty: number;
  isOpenSide: boolean;
}

export interface ChartBar {
  ts: number;          // UTC ms (bar open)
  price: number;       // bar close
  runningShares: number;
  avgOpenPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalR: number | null;
}

export interface TradeChartPayload {
  ticker: string;
  direction: "Long" | "Short";
  dollarRisk: number | null;
  bars: ChartBar[];
  fills: ChartFill[];
  mfe: number;        // max favorable excursion ($), >= 0
  mae: number;        // max adverse excursion ($), <= 0
  mfeR: number | null;
  maeR: number | null;
  source: "polygon" | "empty";
}

interface FillRow {
  date: Date;
  time: string | null;
  side: string;
  price: string;
  qty: number;
}

interface TradeMeta {
  symbol: string;
  direction: string;
  dollar_risk: string | null;
  entry_date: Date;
  entry_time: string | null;
  exit_date: Date | null;
  exit_time: string | null;
}

function toIsoDate(d: Date | string): string {
  if (typeof d === "string") return d;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getTradeChartData(
  tradeId: number
): Promise<TradeChartPayload | null> {
  // 1. Trade metadata + dollar_risk (carry-forward via v_trades_full)
  const meta = await query<TradeMeta>(
    `SELECT t.symbol,
            t.direction,
            v.dollar_risk,
            t.date          AS entry_date,
            t.entry_time,
            t.date          AS exit_date,
            t.exit_time
     FROM trades t
     JOIN v_trades_full v ON v.legacy_trade_id = t.legacy_trade_id
     WHERE t.legacy_trade_id = $1`,
    [tradeId]
  );
  if (!meta[0]) return null;
  const m = meta[0];
  const direction = m.direction === "Short" ? "Short" : "Long";
  const isShort = direction === "Short";
  const dollarRisk = m.dollar_risk === null ? null : Number(m.dollar_risk);

  // 2. Merged fills (same SQL as getTradeExecutions but lighter projection)
  const fillRows = await query<FillRow>(
    `SELECT
        re.date,
        re.time,
        re.side,
        SUM(re.price * re.qty) / NULLIF(SUM(re.qty), 0) AS price,
        SUM(re.qty)::int                                AS qty
     FROM raw_executions re
     JOIN trade_executions te ON te.execution_id = re.id
     JOIN trades t            ON t.id = te.trade_id
     WHERE t.legacy_trade_id = $1
     GROUP BY re.date, re.time, re.side,
              CASE WHEN re.time IS NULL THEN re.id END
     ORDER BY re.date, re.time NULLS LAST`,
    [tradeId]
  );

  // 3. Convert fills to UTC ms and tag open/close side
  const fills: ChartFill[] = fillRows.map((r) => {
    const dateStr = toIsoDate(r.date);
    const ts = etDateTimeToUtcMs(dateStr, r.time);
    const isOpenSide = isShort
      ? r.side === "SS" || r.side === "S"
      : r.side === "B";
    return {
      ts,
      side: r.side,
      price: Number(r.price),
      qty: r.qty,
      isOpenSide,
    };
  });

  if (fills.length === 0) {
    return {
      ticker: m.symbol,
      direction,
      dollarRisk,
      bars: [],
      fills: [],
      mfe: 0,
      mae: 0,
      mfeR: null,
      maeR: null,
      source: "empty",
    };
  }

  // 4. Determine the fetch window: from first fill - 15m to last fill + 15m
  const fromMs = fills[0].ts - PAD_MS;
  const toMs = fills[fills.length - 1].ts + PAD_MS;

  let bars: MinuteBar[] = [];
  try {
    bars = await fetchMinuteAggs(m.symbol, fromMs, toMs);
  } catch (err) {
    // If Polygon fails, surface the error rather than silently returning empty
    throw err instanceof Error ? err : new Error(String(err));
  }

  // 5. Walk bars + fills together
  let runningShares = 0;
  let openShares = 0;
  let openCostNumer = 0;
  let realizedPnl = 0;
  let fillIdx = 0;

  let mfe = 0;
  let mae = 0;

  const outBars: ChartBar[] = bars.map((bar) => {
    // Apply every fill whose ts is <= this bar's ts (bar open).
    // Bar 09:30 covers 09:30:00.000-09:30:59.999; a 09:30:30 fill belongs to
    // this bar's interval. We use bar.ts (open) as the inclusive cutoff plus
    // 60s to capture all fills that landed within the minute.
    const cutoff = bar.ts + 60_000;
    while (fillIdx < fills.length && fills[fillIdx].ts < cutoff) {
      const f = fills[fillIdx++];
      if (f.isOpenSide) {
        openCostNumer += f.price * f.qty;
        openShares += f.qty;
        runningShares += isShort ? -f.qty : f.qty;
      } else {
        // Realize against current avg open basis. For a long: pnl = (sell - avg) * qty.
        // For a short: pnl = (avg - buy) * qty.
        const avgOpen = openShares > 0 ? openCostNumer / openShares : 0;
        const closeQty = f.qty;
        const perShare = isShort ? avgOpen - f.price : f.price - avgOpen;
        realizedPnl += perShare * closeQty;
        runningShares += isShort ? f.qty : -f.qty;
        if (runningShares === 0) {
          openShares = 0;
          openCostNumer = 0;
        } else {
          const remainingAbs = Math.abs(runningShares);
          if (openShares > remainingAbs) {
            const scale = remainingAbs / openShares;
            openCostNumer *= scale;
            openShares = remainingAbs;
          }
        }
      }
    }

    const avgOpenPrice = openShares > 0 ? openCostNumer / openShares : 0;
    // Unrealized: open shares marked at this bar's close.
    let unrealizedPnl = 0;
    if (runningShares !== 0 && avgOpenPrice > 0) {
      const perShare = isShort
        ? avgOpenPrice - bar.close
        : bar.close - avgOpenPrice;
      unrealizedPnl = perShare * Math.abs(runningShares);
    }
    const totalPnl = realizedPnl + unrealizedPnl;

    // MFE/MAE only update while position is open. Once flat, the line is
    // pinned at final realized — including that final value in MFE/MAE
    // accidentally lets the *exit price* count as a peak/trough.
    if (runningShares !== 0) {
      if (totalPnl > mfe) mfe = totalPnl;
      if (totalPnl < mae) mae = totalPnl;
    }

    return {
      ts: bar.ts,
      price: bar.close,
      runningShares,
      avgOpenPrice: Number(avgOpenPrice.toFixed(4)),
      realizedPnl: Number(realizedPnl.toFixed(2)),
      unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
      totalPnl: Number(totalPnl.toFixed(2)),
      totalR:
        dollarRisk && dollarRisk > 0
          ? Number((totalPnl / dollarRisk).toFixed(4))
          : null,
    };
  });

  // Apply any fills that landed after the last bar (e.g. exit a few seconds
  // past the last 1m bar we fetched). They affect realized P&L on the very
  // last bar so the trace ends at the correct realized total.
  while (fillIdx < fills.length) {
    const f = fills[fillIdx++];
    if (f.isOpenSide) {
      openCostNumer += f.price * f.qty;
      openShares += f.qty;
      runningShares += isShort ? -f.qty : f.qty;
    } else {
      const avgOpen = openShares > 0 ? openCostNumer / openShares : 0;
      const perShare = isShort ? avgOpen - f.price : f.price - avgOpen;
      realizedPnl += perShare * f.qty;
      runningShares += isShort ? f.qty : -f.qty;
    }
  }
  if (outBars.length > 0) {
    const last = outBars[outBars.length - 1];
    last.realizedPnl = Number(realizedPnl.toFixed(2));
    last.totalPnl = Number((realizedPnl + last.unrealizedPnl).toFixed(2));
    last.totalR =
      dollarRisk && dollarRisk > 0
        ? Number((last.totalPnl / dollarRisk).toFixed(4))
        : null;
  }

  return {
    ticker: m.symbol,
    direction,
    dollarRisk,
    bars: outBars,
    fills,
    mfe: Number(mfe.toFixed(2)),
    mae: Number(mae.toFixed(2)),
    mfeR:
      dollarRisk && dollarRisk > 0 ? Number((mfe / dollarRisk).toFixed(4)) : null,
    maeR:
      dollarRisk && dollarRisk > 0 ? Number((mae / dollarRisk).toFixed(4)) : null,
    source: outBars.length > 0 ? "polygon" : "empty",
  };
}
