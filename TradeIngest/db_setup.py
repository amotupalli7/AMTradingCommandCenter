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

    # Helpful indexes for common queries
    "CREATE INDEX IF NOT EXISTS idx_raw_exec_date_symbol ON raw_executions(date, symbol)",
    "CREATE INDEX IF NOT EXISTS idx_trades_date_symbol   ON trades(date, symbol)",
    "CREATE INDEX IF NOT EXISTS idx_trades_symbol_date   ON trades(symbol, date)",
    "CREATE INDEX IF NOT EXISTS idx_locates_date_symbol  ON locates(date, symbol)",
    "CREATE INDEX IF NOT EXISTS idx_daily_fees_date      ON daily_fees(date)",
]


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
