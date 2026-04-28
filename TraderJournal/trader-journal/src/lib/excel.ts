/**
 * Postgres-backed data layer for the journal.
 *
 * Despite the filename, this no longer touches trades.xlsx — it queries the
 * `trades_db` Postgres database (populated by TradeIngest's pipeline). The
 * file kept its name and exported function shape so existing API routes
 * (`@/lib/excel`) didn't have to change. Edits are written back to the
 * `trade_journal` table.
 */
import { Trade, Execution, EDITABLE_FIELDS, EditableField } from "./types";
import { query } from "./db";

// ---------------------------------------------------------------------------
// Field-name mapping
// ---------------------------------------------------------------------------
// EDITABLE_FIELDS uses Excel-style names (e.g. "Entry Notes", "Sub-Setup").
// The Postgres column is the snake_case form. This map keeps the API stable.
const EDITABLE_FIELD_TO_COLUMN: Record<EditableField, string> = {
  Trigger: "trigger",
  Tags: "tags",
  "Entry Notes": "entry_notes",
  "Exit Notes": "exit_notes",
  Notes: "notes",
  "Mistake Notes": "mistake_notes",
  Setup: "setup",
  "Sub-Setup": "sub_setup",
};

// ---------------------------------------------------------------------------
// Type-safe row shapes coming back from v_trades_full
// ---------------------------------------------------------------------------

interface TradeRow {
  legacy_trade_id: number;
  date: Date;
  symbol: string;
  direction: string;
  entry_time: string;
  entry_avg_price: string;
  net_pnl: string;
  r_net: string | null;
  win: number;
  x_score: string | null;
  acc_pct: string | null;
  setup: string | null;
  sub_setup: string | null;
  trigger: string | null;
  tags: string | null;
  entry_notes: string | null;
  exit_notes: string | null;
  notes: string | null;
  mistake_notes: string | null;
  chart_url: string | null;
}

interface ExecutionRow extends TradeRow {
  exit_avg_price: string;
  total_entry_shares: number;
  total_exit_shares: number;
  max_position: number;
  num_executions: number;
  gross_pnl: string;
  hold_time_seconds: number | null;
  ecn_fees: string | null;
  sec_fees: string | null;
  finra_fees: string | null;
  htb_fees: string | null;
  cat_fees: string | null;
  commission: string | null;
  trade_index: number;
  dollar_risk: string | null;
  risk_pct: string | null;
  x_failing_goal: string | null;
  x_non_playbook: string | null;
  x_selection: string | null;
  x_entry: string | null;
  x_sizing: string | null;
  x_exit: string | null;
  x_emotional: string | null;
  x_preparation: string | null;
}

// ---------------------------------------------------------------------------
// Formatters (DB types -> the strings/numbers the UI expects)
// ---------------------------------------------------------------------------

function fmtDate(d: Date | string | null): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  // Local-date YYYY-MM-DD (avoid TZ shift from toISOString)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function str(v: string | null | undefined): string {
  return v ?? "";
}

// ---------------------------------------------------------------------------
// Trade ID + date sorting: surface dates in xlsx-compatible YYYY-MM-DD strings
// ---------------------------------------------------------------------------

function rowToTrade(r: TradeRow): Trade {
  return {
    "Trade ID": r.legacy_trade_id,
    Date: fmtDate(r.date),
    "Enter Time": r.entry_time,
    Ticker: r.symbol,
    Side: r.direction,
    Price: num(r.entry_avg_price),
    "Net P&L": num(r.net_pnl),
    "Net R": num(r.r_net),
    Win: num(r.win),
    "X Score": num(r.x_score),
    "Acc %": num(r.acc_pct),
    Setup: str(r.setup),
    "Sub-Setup": str(r.sub_setup),
    Trigger: str(r.trigger),
    Tags: str(r.tags),
    "Entry Notes": str(r.entry_notes),
    "Exit Notes": str(r.exit_notes),
    Notes: str(r.notes),
    "Mistake Notes": str(r.mistake_notes),
    Chart: str(r.chart_url),
    search: `${r.symbol}${str(r.setup)}${str(r.sub_setup)}`,
  };
}

function rowToExecution(r: ExecutionRow): Execution {
  return {
    "Trade ID": r.legacy_trade_id,
    Date: fmtDate(r.date),
    "Enter Time": r.entry_time,
    "Symbol / Ticker": r.symbol,
    Side: r.direction,
    Price: num(r.entry_avg_price),
    Qty: r.total_entry_shares,
    Route: "",
    Type: r.direction === "Short" ? "Short" : "Margin",
    "New Trade": 1,
    "$ Value": num(r.entry_avg_price) * r.total_entry_shares,
    "Gross P&L": num(r.gross_pnl),
    Quantity: r.max_position,
    "Exit Time": "",
    ECN: num(r.ecn_fees),
    Comms: num(r.commission),
    SEC: num(r.sec_fees),
    FINRA: num(r.finra_fees),
    Locates: 0,
    "CAT FEE": num(r.cat_fees),
    "Net P&L": num(r.net_pnl),
    "$ Risk": num(r.dollar_risk),
    "R Net": num(r.r_net),
    Win: num(r.win),
    "Risk %": num(r.risk_pct),
    "X: Failing Goal": num(r.x_failing_goal),
    "X: Non-Playbook Trade": num(r.x_non_playbook),
    "X: Selection Mistake": num(r.x_selection),
    "X: Entry Mistake": num(r.x_entry),
    "X: Sizing Mistake": num(r.x_sizing),
    "X: Exit Mistake": num(r.x_exit),
    "X: Emotional Mistake": num(r.x_emotional),
    "X: Preparation Mistake": num(r.x_preparation),
    "X Score": num(r.x_score),
    Month: r.date instanceof Date ? r.date.getMonth() + 1 : 0,
    "~Pos Size": num(r.entry_avg_price) * r.max_position,
  };
}

// ---------------------------------------------------------------------------
// Public API (preserves the existing call sites)
// ---------------------------------------------------------------------------

const TRADE_COLUMNS = `
  legacy_trade_id, date, symbol, direction, entry_time, entry_avg_price,
  net_pnl, r_net, win, x_score, acc_pct,
  setup, sub_setup, trigger, tags,
  entry_notes, exit_notes, notes, mistake_notes, chart_url
`;

const EXECUTION_COLUMNS = `
  legacy_trade_id, date, symbol, direction, entry_time, entry_avg_price,
  exit_avg_price, total_entry_shares, total_exit_shares, max_position,
  num_executions, gross_pnl, hold_time_seconds,
  ecn_fees, sec_fees, finra_fees, htb_fees, cat_fees, commission,
  net_pnl, r_net, win, x_score, acc_pct, risk_pct, dollar_risk,
  trade_index,
  setup, sub_setup, trigger, tags,
  entry_notes, exit_notes, notes, mistake_notes, chart_url,
  x_failing_goal, x_non_playbook, x_selection, x_entry,
  x_sizing, x_exit, x_emotional, x_preparation
`;

export async function readTrades(): Promise<Trade[]> {
  const rows = await query<TradeRow>(
    `SELECT ${TRADE_COLUMNS}
     FROM v_trades_full
     WHERE legacy_trade_id IS NOT NULL
     ORDER BY date, entry_time`
  );
  return rows.map(rowToTrade);
}

export async function readExecutions(): Promise<Execution[]> {
  const rows = await query<ExecutionRow>(
    `SELECT ${EXECUTION_COLUMNS}
     FROM v_trades_full
     WHERE legacy_trade_id IS NOT NULL
     ORDER BY date, entry_time`
  );
  return rows.map(rowToExecution);
}

export async function getTradeById(tradeId: number): Promise<Trade | undefined> {
  const rows = await query<TradeRow>(
    `SELECT ${TRADE_COLUMNS}
     FROM v_trades_full
     WHERE legacy_trade_id = $1`,
    [tradeId]
  );
  return rows[0] ? rowToTrade(rows[0]) : undefined;
}

export async function updateTradeField(
  tradeId: number,
  field: string,
  value: string
): Promise<{ success: boolean; error?: string }> {
  if (!EDITABLE_FIELDS.includes(field as EditableField)) {
    return { success: false, error: `Field "${field}" is not editable` };
  }

  const column = EDITABLE_FIELD_TO_COLUMN[field as EditableField];
  if (!column) {
    return { success: false, error: `No column mapping for field "${field}"` };
  }

  try {
    // Empty string becomes NULL so the view's COALESCE-style display stays clean
    const dbValue = value === "" ? null : value;

    const result = await query(
      `UPDATE trade_journal
       SET ${column} = $1, updated_at = CURRENT_TIMESTAMP
       WHERE legacy_trade_id = $2`,
      [dbValue, tradeId]
    );
    void result;
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
