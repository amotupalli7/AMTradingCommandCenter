"""
Trade Ingest Pipeline (Postgres)
================================
Processes raw trade CSV files + fee reports (_AR) into a Postgres database.

Data:   Reads from the SPTD 2026 folder:
        M-D-YY.csv          raw executions: time, symbol, side, price, qty, route, type
        M-D-YY_AR.csv       per-symbol fees and broker stats
        M-D-YY_locates.csv  per-day locates (date, symbol, shares, cost) — optional
        locates.csv         consolidated all-time locates fallback

Output: 5 tables in the `trades_db` Postgres database (created by db_setup.py):
        - raw_executions    every fill, append-only
        - trades            consolidated trades (entry -> flat). Cross-day stitched.
        - trade_executions  links each raw execution to its parent trade
        - daily_fees        per-symbol broker AR data
        - locates           per-day locates (may include unused symbols)

Connection settings come from TradeIngest/.env (PG_HOST, PG_PORT, PG_USER,
PG_PASSWORD, PG_DB_TARGET — see db_setup.py).

Usage:
    python ingest_trades.py 3-27-26              # one day
    python ingest_trades.py 3-27-26 3-28-26      # multiple days
    python ingest_trades.py --all                # all CSV files in DATA_DIR
    python ingest_trades.py --force <dates>      # re-ingest a day (deletes & reloads)
    python ingest_trades.py --show               # print all DB contents
    python ingest_trades.py --show 2026-03-27    # one day
    python ingest_trades.py --locates            # ingest consolidated locates.csv
    python ingest_trades.py --data-dir <path> --all
                                                 # use a different source folder
                                                 # (e.g. SPTD 2025 historical backfill)
    python ingest_trades.py --tos <file>         # ingest a TOS history export.
                                                 # All trades treated as long.
                                                 # Non-trade rows (fees, splits,
                                                 # interest, expirations) go to
                                                 # account_events.
"""

import csv
import os
import re
import sys
from datetime import datetime, date, time
from io import StringIO
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent
ENV_PATH = SCRIPT_DIR / ".env"
DATA_DIR = Path(r"C:\Users\sspma\OneDrive\Desktop\Trading Statistics\Personal Stats and Expense Sheets\SPTD 2026")
TARGET_DB = "trades_db"


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def get_conn():
    """Open a connection to the trades Postgres DB using .env config."""
    load_dotenv(ENV_PATH)
    conn = psycopg2.connect(
        host=os.environ["PG_HOST"],
        port=int(os.environ["PG_PORT"]),
        user=os.environ["PG_USER"],
        password=os.environ["PG_PASSWORD"],
        dbname=TARGET_DB,
    )
    return conn


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def parse_date_from_filename(filename):
    """Convert M-D-YY filename to a `date` object."""
    base = filename.replace("_AR", "").replace("_locates", "").replace(".csv", "")
    parts = base.split("-")
    if len(parts) != 3:
        raise ValueError(f"Cannot parse date from filename: {filename}")
    month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
    year = 2000 + year if year < 100 else year
    return date(year, month, day)


def parse_time(t):
    """Normalize time string to a `time` object."""
    parts = t.strip().split(":")
    return time(int(parts[0]), int(parts[1]), int(parts[2]))


def parse_us_date(s):
    """Parse 'M/D/YYYY' (locates.csv format) to date."""
    s = s.strip()
    m, d, y = s.split("/")
    return date(int(y), int(m), int(d))


def load_executions(csv_path, trade_date):
    """Load raw execution CSV into list of dicts (date/time as objects)."""
    rows = []
    with open(csv_path, "r", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row.get("Symbol", "").strip():
                continue
            rows.append({
                "date": trade_date,
                "time": parse_time(row["Time"]),
                "symbol": row["Symbol"].strip().upper(),
                "side": row["Side"].strip().upper(),
                "price": float(row["Price"]),
                "qty": int(row["Qty"]),
                "route": row.get("Route", "").strip(),
                "type": row.get("Type", "").strip(),
            })
    rows.sort(key=lambda r: (r["symbol"], r["time"]))
    return rows


def load_fees(ar_path, trade_date):
    """Load _AR fee report into list of dicts."""
    with open(ar_path, "r", newline="") as f:
        content = f.read()

    reader = csv.reader(StringIO(content))
    all_rows = list(reader)
    if not all_rows:
        return []

    header = all_rows[0]
    clean_header = [h.replace("\r", "").replace("\n", " ").strip() for h in header]

    def safe_float(d, key, default=0.0):
        v = d.get(key, "")
        try:
            return float(v) if v else default
        except ValueError:
            return default

    def safe_int(d, key, default=0):
        v = d.get(key, "")
        try:
            return int(v) if v else default
        except ValueError:
            return default

    rows = []
    for data_row in all_rows[1:]:
        if not data_row or not data_row[0].strip():
            continue
        symbol = data_row[0].strip().upper()
        if symbol == "TOTAL":
            continue

        row_dict = {clean_header[i]: v.strip() for i, v in enumerate(data_row) if i < len(clean_header)}

        rows.append({
            "date": trade_date,
            "symbol": symbol,
            "trades_count": safe_int(row_dict, "Trades"),
            "bought_shares": safe_int(row_dict, "Bought Shares"),
            "b_avg_price": safe_float(row_dict, "B Avg. Price"),
            "sold_shares": safe_int(row_dict, "Sold Shares"),
            "s_avg_price": safe_float(row_dict, "S Avg. Price"),
            "day_trade_pnl": safe_float(row_dict, "Day-trade P&L"),
            "ecn": safe_float(row_dict, "ECN"),
            "sec": safe_float(row_dict, "SEC"),
            "finra": safe_float(row_dict, "FINRA"),
            "htb_fee": safe_float(row_dict, "HTB Fee"),
            "cat_fee": safe_float(row_dict, "CAT Fee"),
        })
    return rows


def load_locates_file(path, default_date=None):
    """
    Load a locates file. Three formats are supported:
      - Consolidated CSV: columns Date, Symbol, Shares, Cost
      - SPTD per-day CSV: columns Symbol, Shares, Cost (date from filename)
      - CBRA per-day _L (no extension): same as SPTD per-day, plus a final
        TOTAL: row that we skip.
    `default_date` is required to parse per-day formats.
    """
    rows = []
    with open(path, "r", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            symbol = row.get("Symbol", "").strip()
            if not symbol or symbol.upper().startswith("TOTAL"):
                continue
            if "Date" in row and row["Date"]:
                row_date = parse_us_date(row["Date"])
            elif default_date is not None:
                row_date = default_date
            else:
                raise ValueError(
                    f"locates file {path} has no Date column and no default_date provided"
                )
            rows.append({
                "date": row_date,
                "symbol": symbol.upper(),
                "shares": int(row["Shares"]),
                "cost": float(row["Cost"]),
            })
    return rows


# ---------------------------------------------------------------------------
# Trade grouping (cross-day aware)
# ---------------------------------------------------------------------------

def find_open_carry(cur, symbol, trade_date, broker="SPTD"):
    """
    Look up the most recent trade for (broker, symbol) strictly before
    `trade_date`. If unclosed (entry_shares != exit_shares), pull its raw
    executions so today's executions can be stitched onto it.
    """
    cur.execute("""
        SELECT id, date, entry_time, total_entry_shares, total_exit_shares
        FROM trades
        WHERE broker = %s AND symbol = %s AND date < %s
        ORDER BY date DESC, entry_time DESC NULLS LAST
        LIMIT 1
    """, (broker, symbol, trade_date))
    row = cur.fetchone()
    if not row:
        return None
    trade_id, prior_date, prior_entry, in_sh, out_sh = row
    if in_sh == out_sh:
        return None

    cur.execute("""
        SELECT re.id, re.date, re.time, re.symbol, re.side, re.price, re.qty, re.route, re.type
        FROM raw_executions re
        JOIN trade_executions te ON te.execution_id = re.id
        WHERE te.trade_id = %s
        ORDER BY re.date, re.time
    """, (trade_id,))
    prior_execs = [{
        "_db_id": e[0], "date": e[1], "time": e[2], "symbol": e[3],
        "side": e[4], "price": float(e[5]), "qty": e[6], "route": e[7], "type": e[8],
    } for e in cur.fetchall()]

    return {"trade_id": trade_id, "prior_date": prior_date,
            "prior_entry_time": prior_entry, "prior_execs": prior_execs}


def group_into_trades(executions, trade_date, cur=None, broker="SPTD"):
    """
    Group raw executions into trades. A trade = first entry until position
    returns to zero. Trades can span multiple days via cross-day stitching:
    if a prior day left an open position, today's executions are appended
    onto that prior trade and the trade is anchored to its original entry date.
    Stitching is scoped to (broker, symbol) so positions across brokers stay
    independent.
    """
    by_symbol = {}
    for i, ex in enumerate(executions):
        by_symbol.setdefault(ex["symbol"], []).append((i, ex))

    trades = []

    for symbol, symbol_execs in sorted(by_symbol.items()):
        carry = (
            find_open_carry(cur, symbol, trade_date, broker=broker)
            if cur is not None else None
        )

        # working list: (today_idx_or_None, exec_dict, signed_qty)
        working = []
        if carry:
            for pex in carry["prior_execs"]:
                signed = -pex["qty"] if pex["side"] in ("SS", "S") else pex["qty"]
                working.append((None, pex, signed))

        for idx, ex in symbol_execs:
            signed = -ex["qty"] if ex["side"] in ("SS", "S") else ex["qty"]
            working.append((idx, ex, signed))

        position = 0
        current = []
        today_trade_index = 0
        first_carry_used = False

        for entry in working:
            current.append(entry)
            position += entry[2]

            if position == 0 and current:
                is_carry = (carry and not first_carry_used
                            and any(e[0] is None for e in current))
                if is_carry:
                    trade = build_trade(symbol, trade_date, 0, current)
                    trade["date"] = carry["prior_date"]
                    trade["entry_time"] = carry["prior_entry_time"]
                    trade["carry"] = {
                        "trade_id": carry["trade_id"],
                        "prior_exec_ids": [e[1]["_db_id"] for e in current if e[0] is None],
                    }
                    first_carry_used = True
                else:
                    today_trade_index += 1
                    trade = build_trade(symbol, trade_date, today_trade_index, current)
                trades.append(trade)
                current = []

        if current:
            is_carry = (carry and not first_carry_used
                        and any(e[0] is None for e in current))
            if is_carry:
                trade = build_trade(symbol, trade_date, 0, current)
                trade["date"] = carry["prior_date"]
                trade["entry_time"] = carry["prior_entry_time"]
                trade["carry"] = {
                    "trade_id": carry["trade_id"],
                    "prior_exec_ids": [e[1]["_db_id"] for e in current if e[0] is None],
                }
                first_carry_used = True
            else:
                today_trade_index += 1
                trade = build_trade(symbol, trade_date, today_trade_index, current)
            trade["unclosed"] = True
            trades.append(trade)

    trades.sort(key=lambda t: t["entry_time"])
    return trades


def build_trade(symbol, trade_date, trade_index, trade_execs):
    """Build a trade summary dict from a list of (idx, execution, signed_qty) tuples."""
    first_signed = trade_execs[0][2]
    if first_signed < 0:
        direction = "Short"
        entry_side = ("SS", "S")
    else:
        direction = "Long"
        entry_side = ("B",)

    entries = [(idx, ex) for idx, ex, sq in trade_execs if ex["side"] in entry_side]
    exits   = [(idx, ex) for idx, ex, sq in trade_execs if ex["side"] not in entry_side]

    entry_total_cost = sum(ex["price"] * ex["qty"] for _, ex in entries)
    entry_total_shares = sum(ex["qty"] for _, ex in entries)
    exit_total_cost = sum(ex["price"] * ex["qty"] for _, ex in exits)
    exit_total_shares = sum(ex["qty"] for _, ex in exits)

    entry_vwap = entry_total_cost / entry_total_shares if entry_total_shares else 0
    exit_vwap = exit_total_cost / exit_total_shares if exit_total_shares else 0

    if direction == "Short":
        gross_pnl = (entry_vwap - exit_vwap) * exit_total_shares
    else:
        gross_pnl = (exit_vwap - entry_vwap) * exit_total_shares

    # Cross-day-aware times: sort by (date, time)
    keyed_times = sorted([(ex["date"], ex["time"]) for _, ex, _ in trade_execs])
    entry_date, entry_time_v = keyed_times[0]
    exit_date, exit_time_v = keyed_times[-1]

    try:
        t1 = datetime.combine(entry_date, entry_time_v)
        t2 = datetime.combine(exit_date, exit_time_v)
        hold_seconds = int((t2 - t1).total_seconds())
    except Exception:
        hold_seconds = 0

    running = 0
    max_pos = 0
    for _, ex, sq in trade_execs:
        running += sq
        max_pos = max(max_pos, abs(running))

    today_shares_traded = sum(ex["qty"] for idx, ex, _ in trade_execs if idx is not None)

    return {
        "date": trade_date,
        "symbol": symbol,
        "direction": direction,
        "entry_time": entry_time_v,
        "exit_time": exit_time_v,
        "entry_avg_price": round(entry_vwap, 6),
        "exit_avg_price": round(exit_vwap, 6),
        "total_entry_shares": entry_total_shares,
        "total_exit_shares": exit_total_shares,
        "max_position": max_pos,
        "num_executions": len(trade_execs),
        "gross_pnl": round(gross_pnl, 2),
        "hold_time_seconds": hold_seconds,
        "trade_index": trade_index,
        "execution_indices": [idx for idx, _, _ in trade_execs if idx is not None],
        "today_shares_traded": today_shares_traded,
        "unclosed": False,
    }


# ---------------------------------------------------------------------------
# Fee allocation
# ---------------------------------------------------------------------------

def allocate_fees(trades, fee_rows, prior_fees_by_trade=None, broker="SPTD"):
    """
    Today's fees split across trades on the symbol in proportion to today's
    shares traded. Carry trades inherit the prior-day fee booking on top.

    Commission rate is per-broker:
      SPTD: $0.0025/share (default)
      CBRA: $0.00 — Cobra is currently free-commission for the first 100 days.
    """
    fee_by_symbol = {fr["symbol"]: fr for fr in fee_rows}
    prior_fees_by_trade = prior_fees_by_trade or {}

    commission_per_share = 0.0 if broker == "CBRA" else 0.0025

    today_shares_by_symbol = {}
    for t in trades:
        sym = t["symbol"]
        today_shares_by_symbol[sym] = today_shares_by_symbol.get(sym, 0) + t.get("today_shares_traded", 0)

    for t in trades:
        sym = t["symbol"]
        fees = fee_by_symbol.get(sym)

        all_shares = t["total_entry_shares"] + t["total_exit_shares"]
        t["commission"] = round(all_shares * commission_per_share, 6)

        prior = prior_fees_by_trade.get(t.get("carry", {}).get("trade_id"), {})
        ecn   = prior.get("ecn_fees", 0.0)
        sec   = prior.get("sec_fees", 0.0)
        finra = prior.get("finra_fees", 0.0)
        htb   = prior.get("htb_fees", 0.0)
        cat   = prior.get("cat_fees", 0.0)

        today_total = today_shares_by_symbol.get(sym, 0)
        if fees and today_total > 0 and t.get("today_shares_traded", 0) > 0:
            proportion = t["today_shares_traded"] / today_total
            ecn   += fees["ecn"]     * proportion
            sec   += fees["sec"]     * proportion
            finra += fees["finra"]   * proportion
            htb   += fees["htb_fee"] * proportion
            cat   += fees["cat_fee"] * proportion

        t["ecn_fees"]   = round(ecn, 6)
        t["sec_fees"]   = round(sec, 6)
        t["finra_fees"] = round(finra, 6)
        t["htb_fees"]   = round(htb, 6)
        t["cat_fees"]   = round(cat, 6)

        total_fees = (t["ecn_fees"] + t["sec_fees"] + t["finra_fees"]
                      + t["htb_fees"] + t["cat_fees"] + t["commission"])
        t["net_pnl"] = round(t["gross_pnl"] - total_fees, 2)


# ---------------------------------------------------------------------------
# DB inserts
# ---------------------------------------------------------------------------

def insert_executions(cur, executions, broker="SPTD"):
    """Insert raw executions, returning a list of row IDs (input order).
    The unique key is (broker, date, time, symbol, side, price, qty, route)."""
    ids = []
    for ex in executions:
        cur.execute("""
            INSERT INTO raw_executions (broker, date, time, symbol, side, price, qty, route, type)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (broker, date, time, symbol, side, price, qty, route) DO NOTHING
            RETURNING id
        """, (broker, ex["date"], ex["time"], ex["symbol"], ex["side"],
              ex["price"], ex["qty"], ex["route"], ex["type"]))
        row = cur.fetchone()
        if row:
            ids.append(row[0])
        else:
            cur.execute("""
                SELECT id FROM raw_executions
                WHERE broker=%s AND date=%s AND symbol=%s AND side=%s
                  AND price=%s AND qty=%s AND route=%s
                  AND time IS NOT DISTINCT FROM %s
            """, (broker, ex["date"], ex["symbol"], ex["side"],
                  ex["price"], ex["qty"], ex["route"], ex["time"]))
            r = cur.fetchone()
            ids.append(r[0] if r else None)
    return ids


def insert_fees(cur, fee_rows):
    """Insert daily AR fee rows, replacing any existing row for the same (date, symbol)."""
    for fr in fee_rows:
        cur.execute("""
            INSERT INTO daily_fees
                (date, symbol, trades_count, bought_shares, b_avg_price,
                 sold_shares, s_avg_price, day_trade_pnl, ecn, sec, finra, htb_fee, cat_fee)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, symbol) DO UPDATE SET
                trades_count  = EXCLUDED.trades_count,
                bought_shares = EXCLUDED.bought_shares,
                b_avg_price   = EXCLUDED.b_avg_price,
                sold_shares   = EXCLUDED.sold_shares,
                s_avg_price   = EXCLUDED.s_avg_price,
                day_trade_pnl = EXCLUDED.day_trade_pnl,
                ecn           = EXCLUDED.ecn,
                sec           = EXCLUDED.sec,
                finra         = EXCLUDED.finra,
                htb_fee       = EXCLUDED.htb_fee,
                cat_fee       = EXCLUDED.cat_fee
        """, (fr["date"], fr["symbol"], fr["trades_count"], fr["bought_shares"],
              fr["b_avg_price"], fr["sold_shares"], fr["s_avg_price"],
              fr["day_trade_pnl"], fr["ecn"], fr["sec"], fr["finra"],
              fr["htb_fee"], fr["cat_fee"]))


def assign_legacy_trade_id(cur, trade_id, preserve_legacy=None):
    """
    Stamp a legacy_trade_id on the given trades.id and ensure a trade_journal
    row exists. Idempotent: if the trade already has a legacy_trade_id, does nothing.

    `preserve_legacy`: if provided, reuse this ID (set by --force snapshot so
    journal notes survive re-ingest). Otherwise allocate MAX+1.
    """
    cur.execute("SELECT legacy_trade_id FROM trades WHERE id = %s", (trade_id,))
    row = cur.fetchone()
    if row and row[0] is not None:
        return row[0]

    if preserve_legacy is not None:
        legacy_id = preserve_legacy
    else:
        cur.execute("SELECT COALESCE(MAX(legacy_trade_id), 0) + 1 FROM trades")
        legacy_id = cur.fetchone()[0]

    cur.execute("UPDATE trades SET legacy_trade_id = %s WHERE id = %s",
                (legacy_id, trade_id))
    cur.execute("""
        INSERT INTO trade_journal (legacy_trade_id) VALUES (%s)
        ON CONFLICT (legacy_trade_id) DO NOTHING
    """, (legacy_id,))
    return legacy_id


def insert_trades(cur, trades, execution_ids, legacy_snapshot=None, broker="SPTD"):
    """
    Insert consolidated trades and link to raw executions. Carry trades are
    UPDATEd in place to keep their original id (and prior trade_executions links).
    Each non-carry trade gets a fresh legacy_trade_id and an empty
    trade_journal row so manual journaling can attach later.

    `legacy_snapshot`: optional dict {(symbol, trade_index): legacy_trade_id}
    captured before --force deleted today's trades, so re-inserted trades in
    the same slot keep their old legacy ID (and attached journal notes).
    """
    legacy_snapshot = legacy_snapshot or {}
    for t in trades:
        carry = t.get("carry")
        if carry:
            trade_id = carry["trade_id"]
            cur.execute("""
                UPDATE trades SET
                    direction=%s, entry_time=%s, exit_time=%s,
                    entry_avg_price=%s, exit_avg_price=%s,
                    total_entry_shares=%s, total_exit_shares=%s,
                    max_position=%s, num_executions=%s, gross_pnl=%s,
                    hold_time_seconds=%s, ecn_fees=%s, sec_fees=%s, finra_fees=%s,
                    htb_fees=%s, cat_fees=%s, commission=%s, net_pnl=%s
                WHERE id=%s
            """, (t["direction"], t["entry_time"], t["exit_time"],
                  t["entry_avg_price"], t["exit_avg_price"],
                  t["total_entry_shares"], t["total_exit_shares"],
                  t["max_position"], t["num_executions"], t["gross_pnl"],
                  t["hold_time_seconds"], t["ecn_fees"], t["sec_fees"],
                  t["finra_fees"], t["htb_fees"], t["cat_fees"],
                  t["commission"], t["net_pnl"], trade_id))
        else:
            cur.execute("""
                INSERT INTO trades
                    (broker, date, symbol, direction, entry_time, exit_time,
                     entry_avg_price, exit_avg_price, total_entry_shares, total_exit_shares,
                     max_position, num_executions, gross_pnl, hold_time_seconds,
                     ecn_fees, sec_fees, finra_fees, htb_fees, cat_fees, commission, net_pnl, trade_index)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (broker, date, symbol, trade_index) DO UPDATE SET
                    direction          = EXCLUDED.direction,
                    entry_time         = EXCLUDED.entry_time,
                    exit_time          = EXCLUDED.exit_time,
                    entry_avg_price    = EXCLUDED.entry_avg_price,
                    exit_avg_price     = EXCLUDED.exit_avg_price,
                    total_entry_shares = EXCLUDED.total_entry_shares,
                    total_exit_shares  = EXCLUDED.total_exit_shares,
                    max_position       = EXCLUDED.max_position,
                    num_executions     = EXCLUDED.num_executions,
                    gross_pnl          = EXCLUDED.gross_pnl,
                    hold_time_seconds  = EXCLUDED.hold_time_seconds,
                    ecn_fees           = EXCLUDED.ecn_fees,
                    sec_fees           = EXCLUDED.sec_fees,
                    finra_fees         = EXCLUDED.finra_fees,
                    htb_fees           = EXCLUDED.htb_fees,
                    cat_fees           = EXCLUDED.cat_fees,
                    commission         = EXCLUDED.commission,
                    net_pnl            = EXCLUDED.net_pnl
                RETURNING id
            """, (broker, t["date"], t["symbol"], t["direction"], t["entry_time"], t["exit_time"],
                  t["entry_avg_price"], t["exit_avg_price"], t["total_entry_shares"],
                  t["total_exit_shares"], t["max_position"], t["num_executions"],
                  t["gross_pnl"], t["hold_time_seconds"],
                  t["ecn_fees"], t["sec_fees"], t["finra_fees"], t["htb_fees"],
                  t["cat_fees"], t["commission"], t["net_pnl"], t["trade_index"]))
            trade_id = cur.fetchone()[0]
            preserved = legacy_snapshot.get((t["symbol"], t["trade_index"]))
            assign_legacy_trade_id(cur, trade_id, preserve_legacy=preserved)

        for exec_idx in t["execution_indices"]:
            exec_id = execution_ids[exec_idx]
            if exec_id:
                cur.execute("""
                    INSERT INTO trade_executions (trade_id, execution_id)
                    VALUES (%s, %s)
                    ON CONFLICT (trade_id, execution_id) DO NOTHING
                """, (trade_id, exec_id))


def insert_locates(cur, locate_rows):
    """Insert locate rows; duplicates (same date/symbol/shares/cost) are ignored."""
    if not locate_rows:
        return 0
    inserted = 0
    for r in locate_rows:
        cur.execute("""
            INSERT INTO locates (date, symbol, shares, cost)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (date, symbol, shares, cost) DO NOTHING
        """, (r["date"], r["symbol"], r["shares"], r["cost"]))
        if cur.rowcount > 0:
            inserted += 1
    return inserted


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def broker_from_data_dir(data_dir):
    """Infer broker code from the folder name's first whitespace token.
    'CBRA 2026' -> 'CBRA'; 'SPTD 2025' -> 'SPTD'. Defaults to 'SPTD' if empty."""
    name = Path(data_dir).name.strip()
    if not name:
        return "SPTD"
    return name.split()[0].upper()


def process_day(conn, date_prefix, force=False, broker=None):
    """Process one trading day. Wraps everything in a single transaction."""
    if broker is None:
        broker = broker_from_data_dir(DATA_DIR)

    csv_path = DATA_DIR / f"{date_prefix}.csv"
    ar_path = DATA_DIR / f"{date_prefix}_AR.csv"
    # Locate file lookup: prefer M-D-YY_locates.csv (legacy SPTD format) but
    # also accept M-D-YY_L (CBRA format, no extension).
    locates_csv = DATA_DIR / f"{date_prefix}_locates.csv"
    locates_l   = DATA_DIR / f"{date_prefix}_L"
    locates_path = locates_csv if locates_csv.exists() else (locates_l if locates_l.exists() else None)

    if not csv_path.exists():
        print(f"  ERROR: {csv_path} not found, skipping.")
        return False
    if not ar_path.exists():
        print(f"  WARNING: {ar_path} not found, processing without fees.")

    trade_date = parse_date_from_filename(date_prefix + ".csv")
    print(f"\n  Processing {date_prefix} -> {trade_date} [broker={broker}]")

    try:
        with conn:  # commits on success, rolls back on exception
            with conn.cursor() as cur:
                legacy_snapshot = {}
                if force:
                    # Snapshot legacy_trade_ids by (symbol, trade_index) so journal
                    # notes survive a re-ingest. The corresponding trade_journal
                    # rows are intentionally NOT deleted - they get re-attached
                    # to the new trades.id via the preserved legacy_trade_id.
                    # Scoped to this broker so other brokers' data on the same date isn't touched.
                    cur.execute("""
                        SELECT symbol, trade_index, legacy_trade_id
                        FROM trades
                        WHERE broker = %s AND date = %s AND legacy_trade_id IS NOT NULL
                    """, (broker, trade_date))
                    legacy_snapshot = {(s, idx): lid for s, idx, lid in cur.fetchall()}
                    if legacy_snapshot:
                        print(f"  Preserving {len(legacy_snapshot)} legacy_trade_id(s) "
                              f"across re-ingest")

                    cur.execute("DELETE FROM trade_executions WHERE trade_id IN (SELECT id FROM trades WHERE broker=%s AND date=%s)", (broker, trade_date))
                    cur.execute("DELETE FROM trades WHERE broker=%s AND date=%s", (broker, trade_date))
                    cur.execute("DELETE FROM raw_executions WHERE broker=%s AND date=%s", (broker, trade_date))
                    cur.execute("DELETE FROM daily_fees WHERE date=%s", (trade_date,))
                    cur.execute("DELETE FROM locates WHERE date=%s", (trade_date,))
                    print("  Cleared existing data for this date (--force)")

                cur.execute("SELECT COUNT(*) FROM raw_executions WHERE broker=%s AND date = %s", (broker, trade_date))
                existing = cur.fetchone()[0]
                if existing > 0:
                    print(f"  Already ingested ({existing} executions). Skipping. Use --force to re-process.")
                    return True

                executions = load_executions(str(csv_path), trade_date)
                print(f"  Loaded {len(executions)} raw executions")

                fee_rows = []
                if ar_path.exists():
                    fee_rows = load_fees(str(ar_path), trade_date)
                    print(f"  Loaded fees for {len(fee_rows)} symbols")

                locate_rows = []
                if locates_path is not None:
                    locate_rows = load_locates_file(str(locates_path), default_date=trade_date)
                    print(f"  Loaded {len(locate_rows)} locates from {locates_path.name}")

                trades = group_into_trades(executions, trade_date, cur=cur, broker=broker)
                print(f"  Grouped into {len(trades)} trades:")
                for t in trades:
                    status = " (UNCLOSED)" if t.get("unclosed") else ""
                    carry_tag = "  [+carry]" if t.get("carry") else ""
                    print(f"    {t['symbol']:6s} {t['direction']:5s}  "
                          f"{t['entry_time']}-{t['exit_time']}  "
                          f"{t['total_entry_shares']:4d} shares  "
                          f"P&L: ${t['gross_pnl']:+.2f}{status}{carry_tag}")

                # Carry-trade prior fees
                prior_fees_by_trade = {}
                for t in trades:
                    carry = t.get("carry")
                    if not carry:
                        continue
                    cur.execute("""
                        SELECT ecn_fees, sec_fees, finra_fees, htb_fees, cat_fees
                        FROM trades WHERE id = %s
                    """, (carry["trade_id"],))
                    row = cur.fetchone()
                    if row:
                        prior_fees_by_trade[carry["trade_id"]] = {
                            "ecn_fees": float(row[0] or 0), "sec_fees": float(row[1] or 0),
                            "finra_fees": float(row[2] or 0), "htb_fees": float(row[3] or 0),
                            "cat_fees": float(row[4] or 0),
                        }

                allocate_fees(trades, fee_rows, prior_fees_by_trade=prior_fees_by_trade, broker=broker)

                execution_ids = insert_executions(cur, executions, broker=broker)
                insert_fees(cur, fee_rows)
                insert_trades(cur, trades, execution_ids, legacy_snapshot=legacy_snapshot, broker=broker)
                if locate_rows:
                    n = insert_locates(cur, locate_rows)
                    print(f"  Inserted {n} new locate rows")

                total_gross = sum(t["gross_pnl"] for t in trades)
                total_net = sum(t.get("net_pnl", t["gross_pnl"]) for t in trades)
                total_fees = total_gross - total_net
                print(f"\n  Day summary: Gross ${total_gross:+.2f} | Fees ${total_fees:.2f} | Net ${total_net:+.2f}")

                # Cross-check vs AR file (skip on swing days)
                has_swing = any(t.get("carry") or t.get("unclosed") for t in trades)
                if fee_rows and not has_swing:
                    ar_pnl = sum(fr["day_trade_pnl"] for fr in fee_rows)
                    total_ecn = sum(fr["ecn"] for fr in fee_rows)
                    total_finra = sum(fr["finra"] for fr in fee_rows)
                    comparable = total_gross - total_ecn - total_finra
                    diff = abs(comparable - ar_pnl)
                    if diff > 0.05:
                        print(f"  WARNING: P&L mismatch vs AR file: ours=${comparable:+.2f} AR=${ar_pnl:+.2f} diff=${diff:.2f}")
                    else:
                        print(f"  OK: P&L matches AR file (${ar_pnl:+.2f})")
        return True
    except Exception as e:
        print(f"  FAILED, transaction rolled back: {e}")
        raise


def find_all_date_prefixes():
    """Find all M-D-YY.csv files (not _AR, not _locates) in DATA_DIR."""
    prefixes = []
    for f in DATA_DIR.glob("*.csv"):
        name = f.stem
        if name.endswith("_AR") or name.endswith("_locates"):
            continue
        if re.match(r"^\d{1,2}-\d{1,2}-\d{2,4}$", name):
            prefixes.append(name)
    prefixes.sort(key=lambda p: parse_date_from_filename(p + ".csv"))
    return prefixes


# ---------------------------------------------------------------------------
# Locates (consolidated file)
# ---------------------------------------------------------------------------

def ingest_consolidated_locates():
    """Load locates.csv into the locates table. Tries DATA_DIR first, then
    the local TradeIngest/SPTD 2026/ folder as a fallback."""
    candidates = [
        DATA_DIR / "locates.csv",
        SCRIPT_DIR / "SPTD 2026" / "locates.csv",
    ]
    path = next((p for p in candidates if p.exists()), None)
    if path is None:
        print(f"  ERROR: locates.csv not found in any of: {[str(p) for p in candidates]}")
        return False
    rows = load_locates_file(str(path))
    print(f"  Loaded {len(rows)} locates from {path}")
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            n = insert_locates(cur, rows)
            print(f"  Inserted {n} new rows ({len(rows) - n} already existed)")
    finally:
        conn.close()
    return True


# ---------------------------------------------------------------------------
# TOS (Thinkorswim) ingest
# ---------------------------------------------------------------------------
# Differences from the SPTD path:
#   - One CSV covers many dates (no per-day file).
#   - No timestamp column (just date) -> raw_executions.time is NULL.
#   - All trades are long-only (Buy = entry, Sell = exit).
#   - Fees & Comm collapsed into the `commission` column.
#   - Non-trade rows (Service Fee, Margin Interest, Reverse Split, Expired)
#     go to account_events instead of trades.
#   - No AR file / locates file; AR cross-check is skipped.

import hashlib

TOS_TRADE_ACTIONS = {
    "Buy": "B",
    "Buy to Open": "B",
    "Sell": "S",
    "Sell to Close": "S",
}
TOS_EVENT_ACTIONS = {"Service Fee", "Margin Interest", "Reverse Split", "Expired"}


def _parse_tos_money(s):
    """Parse a TOS money string into a float.

    Handles: '$0.88 ' -> 0.88,  '($269.02)' -> -269.02,  '"$2,580.06 "' -> 2580.06,
             '' -> None.
    """
    if s is None:
        return None
    s = s.strip().replace(",", "").replace("$", "")
    if not s:
        return None
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1]
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


def _parse_tos_qty(s):
    """Parse '1,000' -> 1000, '' -> None, '-100' -> -100."""
    if s is None:
        return None
    s = s.strip().replace(",", "").replace('"', "")
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _parse_tos_date(s):
    """Parse '4/27/2026' -> date(2026, 4, 27).
    Also handles '02/09/2026 as of 02/06/2026' (option expirations) by
    taking the first date.
    """
    s = s.strip()
    if " as of " in s:
        s = s.split(" as of ", 1)[0].strip()
    m, d, y = s.split("/")
    return date(int(y), int(m), int(d))


def _row_hash(row):
    """Stable hash of a raw CSV row for dedup."""
    h = hashlib.sha256()
    h.update("|".join(row).encode("utf-8"))
    return h.hexdigest()


def load_tos_file(path):
    """
    Read a TOS history CSV. Returns (trade_execs, event_rows).

    trade_execs: list of dicts shaped like SPTD executions
        {date, time=None, symbol, side, price, qty, route='', type='',
         _commission, _ordinal}  -- _ordinal is 0..N in *chronological* order
                                    (date asc, then file-order asc within date)
    event_rows: list of dicts for account_events
        {date, action, symbol, description, quantity, price, fees, amount, raw_row_hash}
    """
    trade_execs = []
    event_rows = []
    skipped = []

    with open(path, "r", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return [], []
        # File is already in date-desc order (most recent first). Read all,
        # then sort ascending so chronology is forward.
        rows = []
        for raw in reader:
            if not raw or not any(c.strip() for c in raw):
                continue
            rows.append(raw)

    # Pad short rows to header width, keep the original row for hashing
    width = len(header)
    fixed = [r + [""] * (width - len(r)) if len(r) < width else r[:width] for r in rows]

    # Stable chronological sort: parse the date once, then sort asc
    # by (date, original-position-from-end-of-file). The TOS file is desc, so
    # original index N in `fixed` had position (len-1-N) in chronological order.
    parsed = []
    for i, r in enumerate(fixed):
        try:
            d = _parse_tos_date(r[0])
        except Exception:
            skipped.append((i, r, "bad date"))
            continue
        parsed.append((d, len(fixed) - 1 - i, r))  # later positions = earlier rows in file
    parsed.sort(key=lambda t: (t[0], t[1]))

    ordinal = 0
    for d, _, r in parsed:
        action = r[1].strip()
        symbol = r[2].strip().upper() or None
        description = r[3].strip() or None
        qty = _parse_tos_qty(r[4])
        price = _parse_tos_money(r[5])
        fees = _parse_tos_money(r[6]) or 0.0
        amount = _parse_tos_money(r[7])

        if action in TOS_TRADE_ACTIONS:
            if qty is None or price is None or symbol is None:
                skipped.append((d, r, f"trade row missing qty/price/symbol"))
                continue
            trade_execs.append({
                "date":       d,
                "time":       None,
                "symbol":     symbol,
                "side":       TOS_TRADE_ACTIONS[action],
                "price":      price,
                "qty":        abs(qty),
                "route":      "",
                "type":       "Margin",
                "_commission": fees,
                "_ordinal":   ordinal,
            })
            ordinal += 1
        elif action in TOS_EVENT_ACTIONS:
            event_rows.append({
                "date":         d,
                "action":       action,
                "symbol":       symbol,
                "description":  description,
                "quantity":     qty,
                "price":        price,
                "fees":         fees if fees else None,
                "amount":       amount,
                "raw_row_hash": _row_hash(r),
            })
        else:
            skipped.append((d, r, f"unknown action {action!r}"))

    return trade_execs, event_rows, skipped


def group_tos_long(trade_execs):
    """
    Group TOS executions into trades. All trades are LONG: a trade opens with
    a Buy when there's no current position and closes when running position
    returns to zero. Cross-day spans are natural since we walk the merged
    chronological list.

    Returns a list of trade dicts in the same shape as build_trade() so
    insert_trades() can store them. trade_index is per (date, symbol) per
    distinct trade on that entry date.
    """
    by_symbol = {}
    for ex in trade_execs:
        by_symbol.setdefault(ex["symbol"], []).append(ex)

    trades = []
    per_date_index = {}  # (entry_date, symbol) -> next index

    for symbol, execs in sorted(by_symbol.items()):
        execs.sort(key=lambda e: (e["date"], e["_ordinal"]))
        position = 0
        current = []  # list of (None, exec_dict, signed_qty)
        for ex in execs:
            signed = ex["qty"] if ex["side"] == "B" else -ex["qty"]
            # If position is 0 and incoming is a sell, this is a stray sell with
            # no prior buy in the window we have. Skip with a warning.
            if position == 0 and signed < 0:
                # Could be a position opened pre-history. Treat as standalone
                # exit attached to a synthetic 0-share trade? We just skip.
                continue
            current.append((None, ex, signed))
            position += signed
            if position == 0 and current:
                trade = _build_tos_trade(symbol, current, per_date_index)
                trades.append(trade)
                current = []

        if current:
            # Unclosed position at end of file
            trade = _build_tos_trade(symbol, current, per_date_index)
            trade["unclosed"] = True
            trades.append(trade)

    trades.sort(key=lambda t: (t["date"], t["symbol"], t["trade_index"]))
    return trades


def _build_tos_trade(symbol, items, per_date_index):
    """Helper: construct a trade dict from a list of (None, exec, signed_qty) tuples."""
    entries = [(idx, ex) for idx, ex, sq in items if sq > 0]
    exits   = [(idx, ex) for idx, ex, sq in items if sq < 0]

    entry_total_cost = sum(ex["price"] * ex["qty"] for _, ex in entries)
    entry_total_shares = sum(ex["qty"] for _, ex in entries)
    exit_total_cost = sum(ex["price"] * ex["qty"] for _, ex in exits)
    exit_total_shares = sum(ex["qty"] for _, ex in exits)

    entry_vwap = entry_total_cost / entry_total_shares if entry_total_shares else 0
    exit_vwap = exit_total_cost / exit_total_shares if exit_total_shares else 0
    gross_pnl = (exit_vwap - entry_vwap) * exit_total_shares  # long-only

    commission = sum(ex["_commission"] for _, ex, _ in items)

    entry_date = min(ex["date"] for _, ex, _ in items)
    exit_date = max(ex["date"] for _, ex, _ in items)

    running = 0
    max_pos = 0
    for item in items:
        running += item[2]
        max_pos = max(max_pos, abs(running))

    key = (entry_date, symbol)
    per_date_index[key] = per_date_index.get(key, 0) + 1
    trade_index = per_date_index[key]

    return {
        "date": entry_date,
        "symbol": symbol,
        "direction": "Long",
        "entry_time": None,
        "exit_time": None,
        "entry_avg_price": round(entry_vwap, 6),
        "exit_avg_price": round(exit_vwap, 6),
        "total_entry_shares": entry_total_shares,
        "total_exit_shares": exit_total_shares,
        "max_position": max_pos,
        "num_executions": len(items),
        "gross_pnl": round(gross_pnl, 2),
        "hold_time_seconds": (exit_date - entry_date).days * 86400,
        "trade_index": trade_index,
        "execution_indices": [],  # filled in by caller after exec inserts
        "today_shares_traded": entry_total_shares + exit_total_shares,
        "unclosed": False,
        "ecn_fees": 0, "sec_fees": 0, "finra_fees": 0,
        "htb_fees": 0, "cat_fees": 0,
        "commission": round(commission, 4),
        "net_pnl": round(gross_pnl - commission, 2),
        "_tos_execs": [ex for _, ex, _ in items],
    }


def insert_account_events(cur, events, broker="TOS"):
    """Insert non-trade rows. Dedupes on (broker, raw_row_hash)."""
    inserted = 0
    for e in events:
        cur.execute("""
            INSERT INTO account_events
                (broker, date, action, symbol, description,
                 quantity, price, fees, amount, raw_row_hash)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (broker, raw_row_hash) DO NOTHING
        """, (broker, e["date"], e["action"], e["symbol"], e["description"],
              e["quantity"], e["price"], e["fees"], e["amount"], e["raw_row_hash"]))
        if cur.rowcount > 0:
            inserted += 1
    return inserted


def process_tos_file(conn, csv_path, force=False):
    """Ingest a TOS history CSV. One transaction for the whole file."""
    csv_path = Path(csv_path)
    if not csv_path.exists():
        print(f"  ERROR: {csv_path} not found")
        return False

    print(f"\n  Processing TOS file: {csv_path}")
    trade_execs, event_rows, skipped = load_tos_file(str(csv_path))
    print(f"  Loaded {len(trade_execs)} trade executions, "
          f"{len(event_rows)} account events, {len(skipped)} skipped rows")
    if skipped:
        print(f"  Skipped samples (first 5):")
        for s in skipped[:5]:
            print(f"    {s}")

    if not trade_execs and not event_rows:
        print("  Nothing to ingest.")
        return True

    try:
        with conn:
            with conn.cursor() as cur:
                if force:
                    print("  --force: clearing existing TOS data...")
                    cur.execute("DELETE FROM trade_executions WHERE trade_id IN (SELECT id FROM trades WHERE broker='TOS')")
                    cur.execute("DELETE FROM trades WHERE broker='TOS'")
                    cur.execute("DELETE FROM raw_executions WHERE broker='TOS'")
                    cur.execute("DELETE FROM account_events WHERE broker='TOS'")

                # Account events first (independent)
                n_events = insert_account_events(cur, event_rows, broker="TOS")
                print(f"  Inserted {n_events} new account events "
                      f"({len(event_rows) - n_events} already present)")

                # Group long-only and insert
                trades = group_tos_long(trade_execs)
                print(f"  Grouped into {len(trades)} trades:")
                for t in trades[:10]:
                    status = " (UNCLOSED)" if t.get("unclosed") else ""
                    print(f"    {t['symbol']:6s} Long  {t['date']}  "
                          f"{t['total_entry_shares']:5d} sh  "
                          f"P&L: ${t['gross_pnl']:+.2f}{status}")
                if len(trades) > 10:
                    print(f"    ... and {len(trades) - 10} more")

                # Insert raw executions; rebuild execution_indices on each trade
                # by mapping the original exec dicts to their inserted IDs.
                exec_ids = insert_executions(cur, trade_execs, broker="TOS")
                # Map exec object identity -> index in trade_execs list
                exec_index_by_id = {id(ex): i for i, ex in enumerate(trade_execs)}
                for t in trades:
                    t["execution_indices"] = [
                        exec_index_by_id[id(ex)] for ex in t.pop("_tos_execs")
                    ]

                insert_trades(cur, trades, exec_ids, broker="TOS")

                total_gross = sum(t["gross_pnl"] for t in trades)
                total_net = sum(t["net_pnl"] for t in trades)
                total_comm = sum(t["commission"] for t in trades)
                print(f"\n  TOS summary: Gross ${total_gross:+.2f} | "
                      f"Comm ${total_comm:.2f} | Net ${total_net:+.2f}")
        return True
    except Exception as e:
        print(f"  FAILED, transaction rolled back: {e}")
        raise


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def show_db(date_filter=None):
    """Print all DB contents to console."""
    conn = get_conn()
    where = "WHERE date = %s" if date_filter else ""
    params = (date_filter,) if date_filter else ()

    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT date, time, symbol, side, price, qty, route, type
                FROM raw_executions {where}
                ORDER BY date, symbol, time
            """, params)
            rows = cur.fetchall()
            print(f"\n{'='*80}\nRAW EXECUTIONS ({len(rows)} rows)\n{'='*80}")
            for r in rows:
                print(f"  {r[0]} {r[1]} {r[2]:6s} {r[3]:3s} {float(r[4]):8.4f} x {r[5]:5d}  {r[6]:<7s} {r[7]:<7s}")

            cur.execute(f"""
                SELECT date, symbol, direction, trade_index, entry_time, exit_time,
                       entry_avg_price, exit_avg_price, total_entry_shares,
                       num_executions, hold_time_seconds, gross_pnl, net_pnl
                FROM trades {where}
                ORDER BY date, entry_time
            """, params)
            rows = cur.fetchall()
            print(f"\n{'='*80}\nTRADES ({len(rows)} rows)\n{'='*80}")
            for r in rows:
                hold = f"{r[10]//60}:{r[10]%60:02d}" if r[10] else "0:00"
                print(f"  {r[0]} {r[1]:6s} {r[2]:5s} #{r[3]} "
                      f"{r[4]}->{r[5]}  "
                      f"{float(r[6]):8.4f}/{float(r[7]):8.4f}  "
                      f"shr={r[8]:5d} execs={r[9]:3d} hold={hold:>6s}  "
                      f"gross={float(r[11]):+9.2f} net={float(r[12]):+9.2f}")

            cur.execute(f"""
                SELECT date, symbol, shares, cost FROM locates {where}
                ORDER BY date, symbol
            """, params)
            rows = cur.fetchall()
            print(f"\n{'='*80}\nLOCATES ({len(rows)} rows)\n{'='*80}")
            for r in rows:
                print(f"  {r[0]} {r[1]:6s} shares={r[2]:5d} cost=${float(r[3]):.4f}")

            cur.execute(f"""
                SELECT date, COUNT(*), SUM(gross_pnl), SUM(net_pnl),
                       SUM(ecn_fees + sec_fees + finra_fees + htb_fees + cat_fees + commission)
                FROM trades {where}
                GROUP BY date ORDER BY date
            """, params)
            rows = cur.fetchall()
            print(f"\n{'='*80}\nDAILY SUMMARY\n{'='*80}")
            print(f"{'Date':<12s} {'Trades':>6s} {'Gross':>10s} {'Fees':>10s} {'Net':>10s}")
            for r in rows:
                print(f"{str(r[0]):<12s} {r[1]:6d} {float(r[2]):+10.2f} {float(r[4]):+10.2f} {float(r[3]):+10.2f}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    global DATA_DIR
    args = sys.argv[1:]

    if not args or "--help" in args:
        print(__doc__)
        sys.exit(1)

    # --data-dir: override DATA_DIR for this run. Accepts a relative or absolute
    # path; relative paths resolve against this script's directory.
    if "--data-dir" in args:
        i = args.index("--data-dir")
        if i + 1 >= len(args):
            print("ERROR: --data-dir requires a path argument", file=sys.stderr)
            sys.exit(2)
        raw = args[i + 1]
        path = Path(raw)
        if not path.is_absolute():
            path = (SCRIPT_DIR / raw).resolve()
        if not path.exists():
            print(f"ERROR: --data-dir path not found: {path}", file=sys.stderr)
            sys.exit(2)
        DATA_DIR = path
        print(f"Using data dir: {DATA_DIR}")
        args = args[:i] + args[i + 2:]

    if "--show" in args:
        show_args = [a for a in args if a != "--show"]
        date_filter = show_args[0] if show_args else None
        show_db(date_filter)
        sys.exit(0)

    if "--locates" in args:
        ingest_consolidated_locates()
        sys.exit(0)

    force = "--force" in args
    args = [a for a in args if a != "--force"]

    # --tos <file>: TOS history ingest. Mutually exclusive with date prefixes.
    if "--tos" in args:
        i = args.index("--tos")
        if i + 1 >= len(args):
            print("ERROR: --tos requires a file path", file=sys.stderr)
            sys.exit(2)
        tos_path = args[i + 1]
        conn = get_conn()
        print(f"Connected to Postgres database '{TARGET_DB}'")
        try:
            process_tos_file(conn, tos_path, force=force)
        finally:
            conn.close()
        print("\nDone.")
        sys.exit(0)

    if "--all" in args:
        prefixes = find_all_date_prefixes()
        if not prefixes:
            print("No trade CSV files found.")
            sys.exit(1)
        print(f"Found {len(prefixes)} trading days")
    else:
        prefixes = args

    conn = get_conn()
    print(f"Connected to Postgres database '{TARGET_DB}'")

    try:
        for prefix in prefixes:
            process_day(conn, prefix, force=force)
    finally:
        conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
