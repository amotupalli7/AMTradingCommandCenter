"""
One-time Postgres bootstrap for the trade pipeline.

Reads connection settings from TradeIngest/.env, then:
  1. Connects to the server's `postgres` admin DB
  2. Creates the target database (TARGET_DB) if it doesn't exist
  3. Connects to that DB and creates the `trades` table

Re-run is safe: CREATE DATABASE is skipped if it exists, CREATE TABLE
uses IF NOT EXISTS.
"""

import os
import sys
from pathlib import Path

import psycopg2
from psycopg2 import sql
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from dotenv import load_dotenv

ENV_PATH = Path(__file__).parent / ".env"
TARGET_DB = "trades_db"


def load_env():
    load_dotenv(ENV_PATH)
    cfg = {
        "host": os.environ["PG_HOST"],
        "port": int(os.environ["PG_PORT"]),
        "user": os.environ["PG_USER"],
        "password": os.environ["PG_PASSWORD"],
        "admin_db": os.environ["PG_DB"],
    }
    return cfg


def ensure_database(cfg, target_db):
    """Create `target_db` if it doesn't exist. Connects to admin_db to do so."""
    conn = psycopg2.connect(
        host=cfg["host"], port=cfg["port"], user=cfg["user"],
        password=cfg["password"], dbname=cfg["admin_db"],
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target_db,))
            exists = cur.fetchone() is not None
            if exists:
                print(f"  database {target_db!r} already exists")
            else:
                cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(target_db)))
                print(f"  created database {target_db!r}")
    finally:
        conn.close()


SCHEMA_DDL = [
    # raw_executions: every individual fill from broker CSV. Audit-trail level.
    """
    CREATE TABLE IF NOT EXISTS raw_executions (
        id      BIGSERIAL PRIMARY KEY,
        date    DATE          NOT NULL,
        time    TIME          NOT NULL,
        symbol  TEXT          NOT NULL,
        side    TEXT          NOT NULL,        -- SS, S, B
        price   NUMERIC(12,4) NOT NULL,
        qty     INTEGER       NOT NULL,
        route   TEXT,
        type    TEXT,                          -- Short, Margin
        UNIQUE (date, time, symbol, side, price, qty, route)
    )
    """,

    # trades: consolidated position open->flat. Cross-day stitched.
    """
    CREATE TABLE IF NOT EXISTS trades (
        id                  BIGSERIAL PRIMARY KEY,
        date                DATE          NOT NULL,    -- entry date (anchors the trade)
        symbol              TEXT          NOT NULL,
        direction           TEXT          NOT NULL,    -- Short or Long
        entry_time          TIME          NOT NULL,
        exit_time           TIME          NOT NULL,
        entry_avg_price     NUMERIC(12,4) NOT NULL,
        exit_avg_price      NUMERIC(12,4) NOT NULL,
        total_entry_shares  INTEGER       NOT NULL,
        total_exit_shares   INTEGER       NOT NULL,
        max_position        INTEGER       NOT NULL,
        num_executions      INTEGER       NOT NULL,
        gross_pnl           NUMERIC(12,2) NOT NULL,
        hold_time_seconds   INTEGER,
        ecn_fees            NUMERIC(10,4) DEFAULT 0,
        sec_fees            NUMERIC(10,4) DEFAULT 0,
        finra_fees          NUMERIC(10,4) DEFAULT 0,
        htb_fees            NUMERIC(10,4) DEFAULT 0,
        cat_fees            NUMERIC(10,4) DEFAULT 0,
        commission          NUMERIC(10,4) DEFAULT 0,
        net_pnl             NUMERIC(12,2) DEFAULT 0,
        trade_index         INTEGER       NOT NULL,
        UNIQUE (date, symbol, trade_index)
    )
    """,

    # trade_executions: many-to-many link (trades <-> raw_executions).
    """
    CREATE TABLE IF NOT EXISTS trade_executions (
        id            BIGSERIAL PRIMARY KEY,
        trade_id      BIGINT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
        execution_id  BIGINT NOT NULL REFERENCES raw_executions(id) ON DELETE CASCADE,
        UNIQUE (trade_id, execution_id)
    )
    """,

    # daily_fees: one row per (date, symbol) from the broker AR file.
    """
    CREATE TABLE IF NOT EXISTS daily_fees (
        id              BIGSERIAL PRIMARY KEY,
        date            DATE   NOT NULL,
        symbol          TEXT   NOT NULL,
        trades_count    INTEGER,
        bought_shares   INTEGER,
        b_avg_price     NUMERIC(12,4),
        sold_shares     INTEGER,
        s_avg_price     NUMERIC(12,4),
        day_trade_pnl   NUMERIC(12,2),
        ecn             NUMERIC(10,4) DEFAULT 0,
        sec             NUMERIC(10,4) DEFAULT 0,
        finra           NUMERIC(10,4) DEFAULT 0,
        htb_fee         NUMERIC(10,4) DEFAULT 0,
        cat_fee         NUMERIC(10,4) DEFAULT 0,
        UNIQUE (date, symbol)
    )
    """,

    # locates: borrowed-share locates from the broker. May include symbols you
    # never actually traded. Cost is the per-locate fee paid (not necessarily
    # consumed).
    """
    CREATE TABLE IF NOT EXISTS locates (
        id      BIGSERIAL PRIMARY KEY,
        date    DATE          NOT NULL,
        symbol  TEXT          NOT NULL,
        shares  INTEGER       NOT NULL,
        cost    NUMERIC(10,4) NOT NULL,
        UNIQUE (date, symbol, shares, cost)
    )
    """,

    # legacy_trade_id: stable Excel-era ID kept on trades for joining to
    # trade_journal. Idempotent ALTER (Postgres 9.6+ supports IF NOT EXISTS).
    "ALTER TABLE trades ADD COLUMN IF NOT EXISTS legacy_trade_id INTEGER",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_legacy_id ON trades(legacy_trade_id) WHERE legacy_trade_id IS NOT NULL",

    # trade_journal: 1:1 with trades, keyed on legacy_trade_id. Holds all
    # manual journaling fields previously in trades.xlsx (both tabs) plus
    # per-trade $ Risk imported from Executions tab.
    """
    CREATE TABLE IF NOT EXISTS trade_journal (
        legacy_trade_id   INTEGER PRIMARY KEY,
        setup             TEXT,
        sub_setup         TEXT,
        trigger           TEXT,
        tags              TEXT,
        entry_notes       TEXT,
        exit_notes        TEXT,
        notes             TEXT,
        mistake_notes     TEXT,
        chart_url         TEXT,
        win_override      INTEGER,                       -- NULL = use computed (net_pnl > 0)
        dollar_risk       NUMERIC(12,4),                 -- per-trade, from xlsx Executions col 24
        -- X-flags: 0, 0.5, or 1 (Excel sometimes assigns partial credit)
        x_failing_goal    NUMERIC(3,2) DEFAULT 0,
        x_non_playbook    NUMERIC(3,2) DEFAULT 0,
        x_selection       NUMERIC(3,2) DEFAULT 0,
        x_entry           NUMERIC(3,2) DEFAULT 0,
        x_sizing          NUMERIC(3,2) DEFAULT 0,
        x_exit            NUMERIC(3,2) DEFAULT 0,
        x_emotional       NUMERIC(3,2) DEFAULT 0,
        x_preparation     NUMERIC(3,2) DEFAULT 0,
        updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,

    # daily_account: one row per trading day. account_value and goal_R are
    # informational; per-trade $ Risk lives on trade_journal and is the
    # source of truth for risk calcs (not always reconcilable with account_value).
    """
    CREATE TABLE IF NOT EXISTS daily_account (
        date          DATE PRIMARY KEY,
        account_value NUMERIC(14,2),
        goal_R        NUMERIC(8,4)
    )
    """,

    # Helpful indexes for common queries
    "CREATE INDEX IF NOT EXISTS idx_raw_exec_date_symbol ON raw_executions(date, symbol)",
    "CREATE INDEX IF NOT EXISTS idx_trades_date_symbol   ON trades(date, symbol)",
    "CREATE INDEX IF NOT EXISTS idx_trades_symbol_date   ON trades(symbol, date)",
    "CREATE INDEX IF NOT EXISTS idx_locates_date_symbol  ON locates(date, symbol)",
    "CREATE INDEX IF NOT EXISTS idx_daily_fees_date      ON daily_fees(date)",
]


# v_trades_full: read-side view that joins trades + trade_journal +
# daily_account and computes the columns that used to be Excel formulas
# (~Pos Size, Acc %, Risk %, R Net, X Score, Day X Score, Day Net R).
# Computed on read so we never have to keep them in sync.
VIEW_DDL = """
CREATE OR REPLACE VIEW v_trades_full AS
WITH per_trade AS (
    SELECT
        t.id                                AS trade_id,
        t.legacy_trade_id,
        t.date,
        t.symbol,
        t.direction,
        t.entry_time,
        t.exit_time,
        t.entry_avg_price,
        t.exit_avg_price,
        t.total_entry_shares,
        t.total_exit_shares,
        t.max_position,
        t.num_executions,
        t.gross_pnl,
        t.hold_time_seconds,
        t.ecn_fees,
        t.sec_fees,
        t.finra_fees,
        t.htb_fees,
        t.cat_fees,
        t.commission,
        t.net_pnl,
        t.trade_index,
        j.setup,
        j.sub_setup,
        j.trigger,
        j.tags,
        j.entry_notes,
        j.exit_notes,
        j.notes,
        j.mistake_notes,
        j.chart_url,
        j.dollar_risk,
        j.x_failing_goal,
        j.x_non_playbook,
        j.x_selection,
        j.x_entry,
        j.x_sizing,
        j.x_exit,
        j.x_emotional,
        j.x_preparation,
        COALESCE(j.win_override,
                 CASE WHEN t.net_pnl > 0 THEN 1 ELSE 0 END)        AS win,
        d.account_value,
        d.goal_R,
        -- ~Pos Size = entry_avg_price * max_position
        ROUND(t.entry_avg_price * t.max_position, 2)                AS pos_size,
        -- Risk % = $ Risk / account_value * 100
        CASE WHEN d.account_value > 0 AND j.dollar_risk IS NOT NULL
             THEN ROUND((j.dollar_risk / d.account_value) * 100, 4)
        END                                                          AS risk_pct,
        -- Acc % = net_pnl / account_value * 100
        CASE WHEN d.account_value > 0
             THEN ROUND((t.net_pnl / d.account_value) * 100, 4)
        END                                                          AS acc_pct,
        -- R Net = net_pnl / dollar_risk
        CASE WHEN j.dollar_risk > 0
             THEN ROUND(t.net_pnl / j.dollar_risk, 4)
        END                                                          AS r_net,
        -- X Score: weighted average. x_failing_goal acts as a gate - if set,
        -- score is 0. Otherwise: (total_weights - sum(flag*weight)) / total_weights.
        -- Weights: non_playbook 1.5, selection 1.5, entry 1, sizing 1, exit 1,
        -- emotional 1.5, preparation 1.5.  Total weight = 9.
        CASE WHEN COALESCE(j.x_failing_goal, 0) = 1 THEN 0
             ELSE ROUND((
                 9.0
                 - COALESCE(j.x_non_playbook, 0) * 1.5
                 - COALESCE(j.x_selection,    0) * 1.5
                 - COALESCE(j.x_entry,        0) * 1.0
                 - COALESCE(j.x_sizing,       0) * 1.0
                 - COALESCE(j.x_exit,         0) * 1.0
                 - COALESCE(j.x_emotional,    0) * 1.5
                 - COALESCE(j.x_preparation,  0) * 1.5
             )::numeric / 9.0, 4)
        END                                                          AS x_score
    FROM trades t
    LEFT JOIN trade_journal j ON j.legacy_trade_id = t.legacy_trade_id
    LEFT JOIN daily_account d ON d.date            = t.date
)
SELECT
    p.*,
    -- Day-level rollups: average X Score and sum of R Net across the day
    AVG(p.x_score) OVER (PARTITION BY p.date)                       AS day_x_score,
    SUM(p.r_net)   OVER (PARTITION BY p.date)                       AS day_net_r
FROM per_trade p
"""


def create_schema(cfg, target_db):
    """Create all tables and indexes inside `target_db`."""
    conn = psycopg2.connect(
        host=cfg["host"], port=cfg["port"], user=cfg["user"],
        password=cfg["password"], dbname=target_db,
    )
    try:
        with conn, conn.cursor() as cur:
            for ddl in SCHEMA_DDL:
                cur.execute(ddl)
            cur.execute(VIEW_DDL)

            cur.execute("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                ORDER BY table_name
            """)
            print("\n  Tables in {!r}:".format(target_db))
            for (t,) in cur.fetchall():
                cur.execute("SELECT COUNT(*) FROM information_schema.columns WHERE table_name = %s", (t,))
                n = cur.fetchone()[0]
                print(f"    {t:<20} ({n} columns)")

            cur.execute("""
                SELECT table_name
                FROM information_schema.views
                WHERE table_schema = 'public'
                ORDER BY table_name
            """)
            views = cur.fetchall()
            if views:
                print(f"\n  Views in {target_db!r}:")
                for (v,) in views:
                    print(f"    {v}")
    finally:
        conn.close()


def main():
    print(f"Loading config from {ENV_PATH}")
    cfg = load_env()
    print(f"  server: {cfg['user']}@{cfg['host']}:{cfg['port']}  admin_db={cfg['admin_db']}")
    print(f"  target DB: {TARGET_DB}\n")

    print("Step 1: ensure target database exists")
    ensure_database(cfg, TARGET_DB)

    print("\nStep 2: create schema (tables + indexes)")
    create_schema(cfg, TARGET_DB)

    print("\nDone.")


if __name__ == "__main__":
    try:
        main()
    except KeyError as e:
        print(f"ERROR: missing env var {e} in {ENV_PATH}", file=sys.stderr)
        sys.exit(1)
    except psycopg2.Error as e:
        print(f"ERROR: postgres: {e}", file=sys.stderr)
        sys.exit(2)
