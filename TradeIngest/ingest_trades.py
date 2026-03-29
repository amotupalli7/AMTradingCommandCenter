"""
Trade Ingest Pipeline
=====================
Processes raw trade CSV files + fee reports (_AR) into a SQLite database.

Input:  M-D-YY.csv      (raw executions: time, symbol, side, price, qty, route, type)
        M-D-YY_AR.csv   (account report: per-symbol fees and summary stats)

Output: trades.db with tables:
        - raw_executions  (every fill, append-only)
        - trades          (consolidated: first entry → position back to 0)
        - trade_executions (links each raw execution to its parent trade)

Usage:
    python ingest_trades.py 3-27-26          # processes 3-27-26.csv and 3-27-26_AR.csv
    python ingest_trades.py 3-27-26 3-28-26  # processes multiple days
    python ingest_trades.py --all            # processes all CSV files in the directory
"""

import csv
import sqlite3
import sys
import os
import re
from datetime import datetime, date
from pathlib import Path

DB_NAME = "trades.db"
SCRIPT_DIR = Path(__file__).parent


# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------

def get_db(db_path=None):
    if db_path is None:
        db_path = SCRIPT_DIR / DB_NAME
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    create_tables(conn)
    return conn


def create_tables(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS raw_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,              -- YYYY-MM-DD
            time TEXT NOT NULL,              -- HH:MM:SS
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,              -- SS, S, B
            price REAL NOT NULL,
            qty INTEGER NOT NULL,
            route TEXT,
            type TEXT,                       -- Short, Margin
            UNIQUE(date, time, symbol, side, price, qty, route)
        );

        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,              -- YYYY-MM-DD
            symbol TEXT NOT NULL,
            direction TEXT NOT NULL,         -- Short or Long
            entry_time TEXT NOT NULL,        -- first execution time
            exit_time TEXT NOT NULL,         -- last execution time
            entry_avg_price REAL NOT NULL,   -- VWAP of entry fills
            exit_avg_price REAL NOT NULL,    -- VWAP of exit fills
            total_entry_shares INTEGER NOT NULL,
            total_exit_shares INTEGER NOT NULL,
            max_position INTEGER NOT NULL,   -- peak shares held
            num_executions INTEGER NOT NULL,
            gross_pnl REAL NOT NULL,
            hold_time_seconds INTEGER,
            -- fees (allocated from _AR file)
            ecn_fees REAL DEFAULT 0,
            sec_fees REAL DEFAULT 0,
            finra_fees REAL DEFAULT 0,
            htb_fees REAL DEFAULT 0,
            cat_fees REAL DEFAULT 0,
            commission REAL DEFAULT 0,   -- $0.0025 per share traded
            net_pnl REAL DEFAULT 0,
            trade_index INTEGER NOT NULL,    -- 1st, 2nd, 3rd trade on this symbol this day
            UNIQUE(date, symbol, trade_index)
        );

        CREATE TABLE IF NOT EXISTS trade_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id INTEGER NOT NULL REFERENCES trades(id),
            execution_id INTEGER NOT NULL REFERENCES raw_executions(id),
            UNIQUE(trade_id, execution_id)
        );

        CREATE TABLE IF NOT EXISTS daily_fees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            symbol TEXT NOT NULL,
            trades_count INTEGER,
            bought_shares INTEGER,
            b_avg_price REAL,
            sold_shares INTEGER,
            s_avg_price REAL,
            day_trade_pnl REAL,
            ecn REAL DEFAULT 0,
            sec REAL DEFAULT 0,
            finra REAL DEFAULT 0,
            htb_fee REAL DEFAULT 0,
            cat_fee REAL DEFAULT 0,
            UNIQUE(date, symbol)
        );
    """)
    conn.commit()


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def parse_date_from_filename(filename):
    """Convert M-D-YY filename to YYYY-MM-DD date string."""
    base = filename.replace("_AR", "").replace(".csv", "")
    parts = base.split("-")
    if len(parts) != 3:
        raise ValueError(f"Cannot parse date from filename: {filename}")
    month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
    year = 2000 + year if year < 100 else year
    return date(year, month, day).isoformat()


def parse_time(t):
    """Normalize time string to HH:MM:SS."""
    parts = t.strip().split(":")
    return f"{int(parts[0]):02d}:{int(parts[1]):02d}:{int(parts[2]):02d}"


def load_executions(csv_path, trade_date):
    """Load raw execution CSV into list of dicts."""
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
    # Sort by symbol then time for grouping
    rows.sort(key=lambda r: (r["symbol"], r["time"]))
    return rows


def load_fees(ar_path, trade_date):
    """Load _AR fee report into list of dicts."""
    rows = []
    with open(ar_path, "r", newline="") as f:
        # The _AR file has multi-line headers due to quoted newlines; read raw
        content = f.read()

    # Re-parse: the header has newlines inside quoted fields, so we need to
    # handle it. Let's just split by newline and find the data rows.
    lines = content.replace("\r\n", "\n").split("\n")

    # Find the header line - it starts with "Symbol,"
    # But the header may span multiple lines due to quoted fields with newlines.
    # Let's use csv.reader which handles this properly.
    from io import StringIO
    reader = csv.reader(StringIO(content))
    all_rows = list(reader)

    if not all_rows:
        return []

    # First row is the header (may have been split across lines by csv.reader)
    header = all_rows[0]

    # Clean up header names - remove newlines within field names
    clean_header = [h.replace("\r", "").replace("\n", " ").strip() for h in header]

    for data_row in all_rows[1:]:
        if not data_row or not data_row[0].strip():
            continue
        symbol = data_row[0].strip().upper()
        if symbol == "TOTAL":
            continue

        row_dict = {}
        for i, val in enumerate(data_row):
            if i < len(clean_header):
                row_dict[clean_header[i]] = val.strip()

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


# ---------------------------------------------------------------------------
# Trade grouping algorithm
# ---------------------------------------------------------------------------

def group_into_trades(executions, trade_date):
    """
    Group raw executions into trades.

    A "trade" is all executions on a symbol from first entry until position
    returns to zero. Partial covers, adds, scales — all part of the same trade.

    Returns list of trade dicts, each containing:
      - metadata (symbol, direction, times, prices, pnl)
      - execution_indices (indices into the executions list)
    """
    # Group by symbol
    by_symbol = {}
    for i, ex in enumerate(executions):
        by_symbol.setdefault(ex["symbol"], []).append((i, ex))

    trades = []

    for symbol, symbol_execs in sorted(by_symbol.items()):
        position = 0
        current_trade_execs = []
        trade_index = 0

        for idx, ex in symbol_execs:
            # Determine signed quantity: short/sell = negative, buy = positive
            if ex["side"] in ("SS", "S"):
                signed_qty = -ex["qty"]
            else:  # B
                signed_qty = ex["qty"]

            current_trade_execs.append((idx, ex, signed_qty))
            position += signed_qty

            # Trade closes when position returns to zero
            if position == 0 and current_trade_execs:
                trade_index += 1
                trade = build_trade(symbol, trade_date, trade_index, current_trade_execs)
                trades.append(trade)
                current_trade_execs = []

        # Handle unclosed positions (position != 0 at end of data)
        if current_trade_execs:
            trade_index += 1
            trade = build_trade(symbol, trade_date, trade_index, current_trade_execs)
            trade["unclosed"] = True
            trades.append(trade)

    # Sort by entry time
    trades.sort(key=lambda t: t["entry_time"])
    return trades


def build_trade(symbol, trade_date, trade_index, trade_execs):
    """Build a trade summary dict from a list of (idx, execution, signed_qty) tuples."""

    # Separate entries and exits based on the first execution's direction
    first_signed = trade_execs[0][2]
    if first_signed < 0:
        direction = "Short"
        entry_side = ("SS", "S")
    else:
        direction = "Long"
        entry_side = ("B",)

    entries = [(idx, ex) for idx, ex, sq in trade_execs if ex["side"] in entry_side]
    exits = [(idx, ex) for idx, ex, sq in trade_execs if ex["side"] not in entry_side]

    # VWAP calculations
    entry_total_cost = sum(ex["price"] * ex["qty"] for _, ex in entries)
    entry_total_shares = sum(ex["qty"] for _, ex in entries)
    exit_total_cost = sum(ex["price"] * ex["qty"] for _, ex in exits)
    exit_total_shares = sum(ex["qty"] for _, ex in exits)

    entry_vwap = entry_total_cost / entry_total_shares if entry_total_shares else 0
    exit_vwap = exit_total_cost / exit_total_shares if exit_total_shares else 0

    # Gross P&L
    if direction == "Short":
        # Shorted at entry_vwap, covered at exit_vwap
        gross_pnl = (entry_vwap - exit_vwap) * exit_total_shares
    else:
        # Bought at entry_vwap, sold at exit_vwap
        gross_pnl = (exit_vwap - entry_vwap) * exit_total_shares

    # Times
    all_times = [ex["time"] for _, ex, _ in trade_execs]
    entry_time = min(all_times)
    exit_time = max(all_times)

    # Hold time
    try:
        t1 = datetime.strptime(entry_time, "%H:%M:%S")
        t2 = datetime.strptime(exit_time, "%H:%M:%S")
        hold_seconds = int((t2 - t1).total_seconds())
    except Exception:
        hold_seconds = 0

    # Max position (peak absolute position during the trade)
    running = 0
    max_pos = 0
    for _, ex, sq in trade_execs:
        running += sq
        max_pos = max(max_pos, abs(running))

    return {
        "date": trade_date,
        "symbol": symbol,
        "direction": direction,
        "entry_time": entry_time,
        "exit_time": exit_time,
        "entry_avg_price": round(entry_vwap, 6),
        "exit_avg_price": round(exit_vwap, 6),
        "total_entry_shares": entry_total_shares,
        "total_exit_shares": exit_total_shares,
        "max_position": max_pos,
        "num_executions": len(trade_execs),
        "gross_pnl": round(gross_pnl, 2),
        "hold_time_seconds": hold_seconds,
        "trade_index": trade_index,
        "execution_indices": [idx for idx, _, _ in trade_execs],
        "unclosed": False,
    }


# ---------------------------------------------------------------------------
# Fee allocation
# ---------------------------------------------------------------------------

def allocate_fees(trades, fee_rows):
    """
    Allocate daily per-symbol fees proportionally across trades on that symbol.
    Proportion is based on each trade's share of total entry shares for the symbol.
    """
    # Build fee lookup: symbol -> fee dict
    fee_by_symbol = {}
    for fr in fee_rows:
        fee_by_symbol[fr["symbol"]] = fr

    # Get total entry shares per symbol across all trades
    symbol_total_shares = {}
    for t in trades:
        sym = t["symbol"]
        symbol_total_shares[sym] = symbol_total_shares.get(sym, 0) + t["total_entry_shares"]

    for t in trades:
        sym = t["symbol"]
        fees = fee_by_symbol.get(sym)
        # Commission: $0.0025 per share traded (both entry and exit)
        total_shares_traded = t["total_entry_shares"] + t["total_exit_shares"]
        t["commission"] = round(total_shares_traded * 0.0025, 6)

        if not fees or symbol_total_shares.get(sym, 0) == 0:
            t["ecn_fees"] = 0
            t["sec_fees"] = 0
            t["finra_fees"] = 0
            t["htb_fees"] = 0
            t["cat_fees"] = 0
            t["net_pnl"] = round(t["gross_pnl"] - t["commission"], 2)
            continue

        proportion = t["total_entry_shares"] / symbol_total_shares[sym]
        t["ecn_fees"] = round(fees["ecn"] * proportion, 6)
        t["sec_fees"] = round(fees["sec"] * proportion, 6)
        t["finra_fees"] = round(fees["finra"] * proportion, 6)
        t["htb_fees"] = round(fees["htb_fee"] * proportion, 6)
        t["cat_fees"] = round(fees["cat_fee"] * proportion, 6)

        total_fees = (t["ecn_fees"] + t["sec_fees"] + t["finra_fees"]
                      + t["htb_fees"] + t["cat_fees"] + t["commission"])
        t["net_pnl"] = round(t["gross_pnl"] - total_fees, 2)


# ---------------------------------------------------------------------------
# Database insertion
# ---------------------------------------------------------------------------

def insert_executions(conn, executions):
    """Insert raw executions, returning list of row IDs (matching input order)."""
    ids = []
    for ex in executions:
        cur = conn.execute("""
            INSERT OR IGNORE INTO raw_executions (date, time, symbol, side, price, qty, route, type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (ex["date"], ex["time"], ex["symbol"], ex["side"],
              ex["price"], ex["qty"], ex["route"], ex["type"]))

        if cur.lastrowid:
            ids.append(cur.lastrowid)
        else:
            # Already existed, fetch the id
            row = conn.execute("""
                SELECT id FROM raw_executions
                WHERE date=? AND time=? AND symbol=? AND side=? AND price=? AND qty=? AND route=?
            """, (ex["date"], ex["time"], ex["symbol"], ex["side"],
                  ex["price"], ex["qty"], ex["route"])).fetchone()
            ids.append(row[0] if row else None)
    conn.commit()
    return ids


def insert_fees(conn, fee_rows):
    """Insert daily fee records."""
    for fr in fee_rows:
        conn.execute("""
            INSERT OR REPLACE INTO daily_fees
            (date, symbol, trades_count, bought_shares, b_avg_price, sold_shares,
             s_avg_price, day_trade_pnl, ecn, sec, finra, htb_fee, cat_fee)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (fr["date"], fr["symbol"], fr["trades_count"], fr["bought_shares"],
              fr["b_avg_price"], fr["sold_shares"], fr["s_avg_price"],
              fr["day_trade_pnl"], fr["ecn"], fr["sec"], fr["finra"],
              fr["htb_fee"], fr["cat_fee"]))
    conn.commit()


def insert_trades(conn, trades, execution_ids):
    """Insert consolidated trades and link to raw executions."""
    for t in trades:
        cur = conn.execute("""
            INSERT OR REPLACE INTO trades
            (date, symbol, direction, entry_time, exit_time,
             entry_avg_price, exit_avg_price, total_entry_shares, total_exit_shares,
             max_position, num_executions, gross_pnl, hold_time_seconds,
             ecn_fees, sec_fees, finra_fees, htb_fees, cat_fees, commission, net_pnl, trade_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (t["date"], t["symbol"], t["direction"], t["entry_time"], t["exit_time"],
              t["entry_avg_price"], t["exit_avg_price"], t["total_entry_shares"],
              t["total_exit_shares"], t["max_position"], t["num_executions"],
              t["gross_pnl"], t["hold_time_seconds"],
              t["ecn_fees"], t["sec_fees"], t["finra_fees"], t["htb_fees"],
              t["cat_fees"], t["commission"], t["net_pnl"], t["trade_index"]))
        trade_id = cur.lastrowid

        # Link executions
        for exec_idx in t["execution_indices"]:
            exec_id = execution_ids[exec_idx]
            if exec_id:
                conn.execute("""
                    INSERT OR IGNORE INTO trade_executions (trade_id, execution_id)
                    VALUES (?, ?)
                """, (trade_id, exec_id))

    conn.commit()


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def process_day(conn, date_prefix):
    """Process one trading day given its file prefix (e.g., '3-27-26')."""
    csv_path = SCRIPT_DIR / f"{date_prefix}.csv"
    ar_path = SCRIPT_DIR / f"{date_prefix}_AR.csv"

    if not csv_path.exists():
        print(f"  ERROR: {csv_path} not found, skipping.")
        return False
    if not ar_path.exists():
        print(f"  WARNING: {ar_path} not found, processing without fees.")

    trade_date = parse_date_from_filename(date_prefix + ".csv")
    print(f"\n  Processing {date_prefix} -> {trade_date}")

    # Check if already ingested
    existing = conn.execute(
        "SELECT COUNT(*) FROM raw_executions WHERE date = ?", (trade_date,)
    ).fetchone()[0]
    if existing > 0:
        print(f"  Already ingested ({existing} executions). Skipping. Use --force to re-process.")
        return True

    # Load data
    executions = load_executions(str(csv_path), trade_date)
    print(f"  Loaded {len(executions)} raw executions")

    fee_rows = []
    if ar_path.exists():
        fee_rows = load_fees(str(ar_path), trade_date)
        print(f"  Loaded fees for {len(fee_rows)} symbols")

    # Group into trades
    trades = group_into_trades(executions, trade_date)
    print(f"  Grouped into {len(trades)} trades:")
    for t in trades:
        status = " (UNCLOSED)" if t.get("unclosed") else ""
        print(f"    {t['symbol']:6s} {t['direction']:5s}  "
              f"{t['entry_time']}-{t['exit_time']}  "
              f"{t['total_entry_shares']:4d} shares  "
              f"P&L: ${t['gross_pnl']:+.2f}{status}")

    # Allocate fees
    if fee_rows:
        allocate_fees(trades, fee_rows)

    # Insert into DB
    execution_ids = insert_executions(conn, executions)
    insert_fees(conn, fee_rows)
    insert_trades(conn, trades, execution_ids)

    # Summary
    total_gross = sum(t["gross_pnl"] for t in trades)
    total_net = sum(t.get("net_pnl", t["gross_pnl"]) for t in trades)
    total_fees = total_gross - total_net
    print(f"\n  Day summary: Gross ${total_gross:+.2f} | Fees ${total_fees:.2f} | Net ${total_net:+.2f}")

    # Cross-check with AR file
    # Note: AR "Day-trade P&L" already includes ECN + FINRA fees, so compare
    # our gross minus those two fee types against the AR value
    if fee_rows:
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


def find_all_date_prefixes():
    """Find all M-D-YY.csv files (not _AR) in the script directory."""
    prefixes = []
    for f in SCRIPT_DIR.glob("*.csv"):
        name = f.stem
        if name.endswith("_AR"):
            continue
        # Check it looks like a date: digits-digits-digits
        if re.match(r"^\d{1,2}-\d{1,2}-\d{2,4}$", name):
            prefixes.append(name)
    prefixes.sort(key=lambda p: parse_date_from_filename(p + ".csv"))
    return prefixes


def show_db(date_filter=None):
    """Print all DB contents to console."""
    conn = get_db()
    where = f"WHERE date = '{date_filter}'" if date_filter else ""

    # --- Raw Executions ---
    rows = conn.execute(f"""
        SELECT date, time, symbol, side, price, qty, route, type
        FROM raw_executions {where}
        ORDER BY date, symbol, time
    """).fetchall()
    print(f"\n{'='*80}")
    print(f"RAW EXECUTIONS ({len(rows)} rows)")
    print(f"{'='*80}")
    print(f"{'Date':<12s} {'Time':<10s} {'Symbol':<7s} {'Side':<5s} {'Price':>8s} {'Qty':>5s} {'Route':<7s} {'Type':<7s}")
    print("-" * 80)
    for r in rows:
        print(f"{r[0]:<12s} {r[1]:<10s} {r[2]:<7s} {r[3]:<5s} {r[4]:8.4f} {r[5]:5d} {r[6]:<7s} {r[7]:<7s}")

    # --- Trades ---
    rows = conn.execute(f"""
        SELECT date, symbol, direction, trade_index, entry_time, exit_time,
               entry_avg_price, exit_avg_price, total_entry_shares, max_position,
               num_executions, hold_time_seconds, gross_pnl, net_pnl,
               ecn_fees, sec_fees, finra_fees, htb_fees, cat_fees, commission
        FROM trades {where}
        ORDER BY date, entry_time
    """).fetchall()
    print(f"\n{'='*80}")
    print(f"TRADES ({len(rows)} rows)")
    print(f"{'='*80}")
    print(f"{'Date':<12s} {'Sym':<6s} {'Dir':<6s} {'#':>2s} {'Entry':>8s} {'Exit':>8s} "
          f"{'EntPx':>8s} {'ExPx':>8s} {'Shares':>6s} {'MaxPos':>6s} {'#Exec':>5s} "
          f"{'Hold':>6s} {'Gross':>9s} {'Net':>9s}")
    print("-" * 110)
    for r in rows:
        hold = f"{r[11]//60}:{r[11]%60:02d}" if r[11] else "0:00"
        print(f"{r[0]:<12s} {r[1]:<6s} {r[2]:<6s} {r[3]:2.0f} {r[4]:>8s} {r[5]:>8s} "
              f"{r[6]:8.4f} {r[7]:8.4f} {r[8]:6.0f} {r[9]:6.0f} {r[10]:5.0f} "
              f"{hold:>6s} {r[12]:+9.2f} {r[13]:+9.2f}")

    # --- Fee breakdown per trade ---
    print(f"\n{'='*80}")
    print("FEE BREAKDOWN PER TRADE")
    print(f"{'='*80}")
    print(f"{'Date':<12s} {'Sym':<6s} {'#':>2s} {'ECN':>8s} {'SEC':>8s} {'FINRA':>8s} {'HTB':>8s} {'CAT':>8s} {'Comm':>8s} {'TotFee':>9s}")
    print("-" * 90)
    for r in rows:
        total_fee = r[14] + r[15] + r[16] + r[17] + r[18] + r[19]
        print(f"{r[0]:<12s} {r[1]:<6s} {r[3]:2.0f} {r[14]:8.4f} {r[15]:8.4f} {r[16]:8.4f} {r[17]:8.4f} {r[18]:8.4f} {r[19]:8.4f} {total_fee:+9.4f}")

    # --- Daily Fees ---
    rows = conn.execute(f"""
        SELECT date, symbol, trades_count, bought_shares, b_avg_price,
               sold_shares, s_avg_price, day_trade_pnl, ecn, sec, finra, htb_fee, cat_fee
        FROM daily_fees {where}
        ORDER BY date, symbol
    """).fetchall()
    print(f"\n{'='*80}")
    print(f"DAILY FEES from AR file ({len(rows)} rows)")
    print(f"{'='*80}")
    print(f"{'Date':<12s} {'Sym':<6s} {'Trades':>6s} {'BShrs':>6s} {'BAvg':>8s} {'SShrs':>6s} {'SAvg':>8s} "
          f"{'DayPnL':>9s} {'ECN':>8s} {'SEC':>6s} {'FINRA':>7s} {'HTB':>8s} {'CAT':>6s}")
    print("-" * 110)
    for r in rows:
        print(f"{r[0]:<12s} {r[1]:<6s} {r[2]:6d} {r[3]:6d} {r[4]:8.4f} {r[5]:6d} {r[6]:8.4f} "
              f"{r[7]:+9.2f} {r[8]:8.4f} {r[9]:6.4f} {r[10]:7.4f} {r[11]:8.4f} {r[12]:6.4f}")

    # --- Summary ---
    summary = conn.execute(f"""
        SELECT date, COUNT(*), SUM(gross_pnl), SUM(net_pnl),
               SUM(ecn_fees + sec_fees + finra_fees + htb_fees + cat_fees + commission)
        FROM trades {where}
        GROUP BY date ORDER BY date
    """).fetchall()
    print(f"\n{'='*80}")
    print("DAILY SUMMARY")
    print(f"{'='*80}")
    print(f"{'Date':<12s} {'Trades':>6s} {'Gross':>10s} {'Fees':>10s} {'Net':>10s}")
    print("-" * 50)
    for r in summary:
        print(f"{r[0]:<12s} {r[1]:6d} {r[2]:+10.2f} {r[4]:+10.2f} {r[3]:+10.2f}")

    conn.close()


def main():
    args = sys.argv[1:]

    if not args or "--help" in args:
        print("Usage:")
        print("  python ingest_trades.py 3-27-26          # process one day")
        print("  python ingest_trades.py 3-27-26 3-28-26  # process multiple days")
        print("  python ingest_trades.py --all             # process all CSV files")
        print("  python ingest_trades.py --show            # print all DB contents")
        print("  python ingest_trades.py --show 2026-03-27 # print one day")
        sys.exit(1)

    if "--show" in args:
        show_args = [a for a in args if a != "--show"]
        date_filter = show_args[0] if show_args else None
        show_db(date_filter)
        sys.exit(0)

    force = "--force" in args
    args = [a for a in args if a != "--force"]

    if "--all" in args:
        prefixes = find_all_date_prefixes()
        if not prefixes:
            print("No trade CSV files found.")
            sys.exit(1)
        print(f"Found {len(prefixes)} trading days: {', '.join(prefixes)}")
    else:
        prefixes = args

    conn = get_db()
    print(f"Database: {SCRIPT_DIR / DB_NAME}")

    if force:
        for prefix in prefixes:
            trade_date = parse_date_from_filename(prefix + ".csv")
            conn.execute("DELETE FROM trade_executions WHERE trade_id IN (SELECT id FROM trades WHERE date=?)", (trade_date,))
            conn.execute("DELETE FROM trades WHERE date = ?", (trade_date,))
            conn.execute("DELETE FROM raw_executions WHERE date = ?", (trade_date,))
            conn.execute("DELETE FROM daily_fees WHERE date = ?", (trade_date,))
        conn.commit()
        print("Cleared existing data for selected dates (--force)")

    for prefix in prefixes:
        process_day(conn, prefix)

    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
