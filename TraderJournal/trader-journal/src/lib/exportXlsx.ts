/**
 * Multi-sheet XLSX export for the Analysis tab.
 *
 * Builds three sheets:
 *   1. Trades     — one row per trade (existing CSV columns + MFE/MAE)
 *   2. P&L Trace  — one row per (trade, 1m bar) with running P&L stats
 *   3. Executions — one row per fill across all trades
 *
 * The trace + executions data is fetched in one POST to /api/trade/export
 * which batches Polygon calls server-side.
 */
import * as XLSX from "xlsx";
import { Trade } from "./types";

interface ChartFill {
  ts: number;
  side: string;
  price: number;
  qty: number;
  isOpenSide: boolean;
}

interface ChartBar {
  ts: number;
  price: number;
  runningShares: number;
  avgOpenPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalR: number | null;
}

interface TracePayload {
  ticker: string;
  direction: "Long" | "Short";
  dollarRisk: number | null;
  bars: ChartBar[];
  fills: ChartFill[];
  mfe: number;
  mae: number;
  mfeR: number | null;
  maeR: number | null;
  source: "polygon" | "empty";
}

interface ExecutionRow {
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

interface ExportResponse {
  traces: Record<number, TracePayload | { error: string }>;
  executions: Record<number, ExecutionRow[] | { error: string }>;
}

function fmtTimeEt(ms: number): string {
  // Mirror the chart's ET display; bar timestamps are UTC ms from Polygon.
  return new Date(ms).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtDateEt(ms: number): string {
  // YYYY-MM-DD in ET, matching the per-trade Date column.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

function isErrorObj<T>(v: T | { error: string }): v is { error: string } {
  return typeof v === "object" && v !== null && "error" in (v as object);
}

export async function exportTradesWorkbook(trades: Trade[]): Promise<void> {
  const tradeIds = trades.map((t) => t["Trade ID"]);

  // 1. Bulk-fetch chart traces + executions for every filtered trade.
  const res = await fetch("/api/trade/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tradeIds }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Export fetch failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const payload = (await res.json()) as ExportResponse;

  // 2. Build the Trades sheet (existing columns + MFE/MAE/MFE_R/MAE_R).
  const tradeHeaders = [
    "Trade ID", "Date", "Enter Time", "Ticker", "Side", "Price",
    "Net P&L", "Net R", "Win", "X Score",
    "Setup", "Sub-Setup", "Tags",
    "Entry Notes", "Exit Notes", "Notes", "Mistake Notes",
    "MFE $", "MAE $", "MFE R", "MAE R",
  ];
  const tradeRows = trades.map((t) => {
    const trace = payload.traces[t["Trade ID"]];
    const mfe = trace && !isErrorObj(trace) ? trace.mfe : null;
    const mae = trace && !isErrorObj(trace) ? trace.mae : null;
    const mfeR = trace && !isErrorObj(trace) ? trace.mfeR : null;
    const maeR = trace && !isErrorObj(trace) ? trace.maeR : null;
    return [
      t["Trade ID"], t.Date, t["Enter Time"], t.Ticker, t.Side, t.Price,
      t["Net P&L"], t["Net R"], t.Win, t["X Score"],
      t.Setup, t["Sub-Setup"], t.Tags,
      t["Entry Notes"], t["Exit Notes"], t.Notes, t["Mistake Notes"],
      mfe, mae, mfeR, maeR,
    ];
  });

  // 3. Build the P&L Trace sheet — one row per (trade, bar).
  const traceHeaders = [
    "Trade ID", "Ticker", "Direction",
    "Date (ET)", "Time (ET)", "Bar TS (UTC ms)",
    "Price", "Running Shares", "Avg Open Price",
    "Realized $", "Unrealized $", "Total $", "Total R",
  ];
  const traceRows: (string | number | null)[][] = [];
  for (const t of trades) {
    const trace = payload.traces[t["Trade ID"]];
    if (!trace || isErrorObj(trace)) continue;
    for (const bar of trace.bars) {
      traceRows.push([
        t["Trade ID"], trace.ticker, trace.direction,
        fmtDateEt(bar.ts), fmtTimeEt(bar.ts), bar.ts,
        bar.price, bar.runningShares, bar.avgOpenPrice,
        bar.realizedPnl, bar.unrealizedPnl, bar.totalPnl, bar.totalR,
      ]);
    }
  }

  // 4. Build the Executions sheet — one row per fill.
  const execHeaders = [
    "Trade ID", "Ticker", "Date", "Time", "Side", "Price", "Qty", "Route",
    "Running Shares", "Avg Open Price", "Pos $", "Acc %",
  ];
  const execRows: (string | number | null)[][] = [];
  for (const t of trades) {
    const execs = payload.executions[t["Trade ID"]];
    if (!execs || isErrorObj(execs)) continue;
    for (const e of execs) {
      execRows.push([
        t["Trade ID"], t.Ticker, e.date, e.time, e.side, e.price, e.qty, e.route,
        e.runningShares, e.avgOpenPrice, e.posValue, e.accPct,
      ]);
    }
  }

  // 5. Assemble + download
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([tradeHeaders, ...tradeRows]),
    "Trades"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([traceHeaders, ...traceRows]),
    "P&L Trace"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([execHeaders, ...execRows]),
    "Executions"
  );

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `trades-export-${today}.xlsx`);
}
