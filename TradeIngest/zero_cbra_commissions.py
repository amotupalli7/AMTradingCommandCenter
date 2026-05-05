"""
One-time fix: zero out commission on all existing CBRA trades and recompute
net_pnl accordingly. Cobra is currently free-commission for the first 100 days,
so the $0.0025/share booked at ingest time is wrong.

Usage:
    python TradeIngest/zero_cbra_commissions.py            # dry run
    python TradeIngest/zero_cbra_commissions.py --apply    # write the change

After this is done, future ingests will skip the commission for CBRA at the
source (see allocate_fees in ingest_trades.py).
"""
import argparse
import os
import sys
from decimal import Decimal

import psycopg2
from dotenv import load_dotenv


def get_conn():
    load_dotenv(".env")
    load_dotenv("TradeIngest/.env")
    return psycopg2.connect(
        host=os.environ.get("PG_HOST", "localhost"),
        port=os.environ.get("PG_PORT", "5432"),
        dbname=os.environ.get("PG_DATABASE", "trades_db"),
        user=os.environ.get("PG_USER"),
        password=os.environ.get("PG_PASSWORD"),
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    conn = get_conn()
    cur = conn.cursor()

    # Pull every CBRA trade with non-zero commission so we can show what changes.
    cur.execute("""
        SELECT id, symbol, gross_pnl, commission, net_pnl
        FROM trades
        WHERE broker = 'CBRA' AND commission <> 0
        ORDER BY date, entry_time
    """)
    rows = cur.fetchall()
    if not rows:
        print("No CBRA trades with non-zero commission. Nothing to do.")
        return 0

    total_comm = sum(r[3] for r in rows)
    print(f"CBRA trades with non-zero commission: {len(rows)}")
    print(f"Total commission to zero out:         ${total_comm:.4f}")
    print(f"Net P&L will increase by the same amount.\n")

    print("Sample (first 5):")
    print(f"  {'id':>6}  {'symbol':6}  {'gross':>10}  {'old_comm':>10}  {'old_net':>10}  {'new_net':>10}")
    for r in rows[:5]:
        new_net = r[2] - (r[3] - r[3])  # gross - other_fees, where other_fees = gross - net - commission_old.
        # Simpler: new_net = old_net + old_commission
        new_net = r[4] + r[3]
        print(f"  {r[0]:>6}  {r[1]:6}  {r[2]:>10.2f}  {r[3]:>10.4f}  {r[4]:>10.2f}  {new_net:>10.2f}")

    if not args.apply:
        print("\nDry run. Re-run with --apply to write the changes.")
        return 0

    cur.execute("""
        UPDATE trades
        SET net_pnl = net_pnl + commission,
            commission = 0
        WHERE broker = 'CBRA' AND commission <> 0
    """)
    affected = cur.rowcount
    conn.commit()
    print(f"\nUpdated {affected} CBRA trades. commission set to 0; net_pnl bumped accordingly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
