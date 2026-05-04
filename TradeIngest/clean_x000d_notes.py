"""
One-time cleanup: strip the literal `_x000d_` Excel CR escape from journal
note fields in trade_journal, and collapse the blank-line runs that result.

Affected columns: entry_notes, exit_notes, notes, mistake_notes.

Run with:
    python TradeIngest/clean_x000d_notes.py            # dry run, prints diff summary
    python TradeIngest/clean_x000d_notes.py --apply    # writes the cleanup
"""
import argparse
import os
import re
import sys

import psycopg2
from dotenv import load_dotenv

NOTE_COLUMNS = ("entry_notes", "exit_notes", "notes", "mistake_notes")

# Excel's OOXML CR escape. Case-insensitive in practice — match either form.
X000D_RE = re.compile(r"_x000d_", re.IGNORECASE)
# Collapse 3+ consecutive newlines down to a single blank line.
MULTI_NL_RE = re.compile(r"\n{3,}")


def clean_text(s: str | None) -> str | None:
    if s is None:
        return None
    cleaned = X000D_RE.sub("", s)
    # Trim trailing spaces on each line, then collapse blank-line runs.
    cleaned = "\n".join(line.rstrip() for line in cleaned.split("\n"))
    cleaned = MULTI_NL_RE.sub("\n\n", cleaned)
    # Trim leading/trailing whitespace overall.
    return cleaned.strip()


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
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the cleanup. Without this flag, runs read-only and prints a summary.",
    )
    args = parser.parse_args()

    conn = get_conn()
    cur = conn.cursor()

    select_cols = ", ".join(("legacy_trade_id",) + NOTE_COLUMNS)
    where = " OR ".join(f"{c} ILIKE %s" for c in NOTE_COLUMNS)
    cur.execute(
        f"SELECT {select_cols} FROM trade_journal WHERE {where}",
        ("%_x000d_%",) * len(NOTE_COLUMNS),
    )
    rows = cur.fetchall()
    print(f"Rows with _x000d_ in any note column: {len(rows)}")

    updates = []
    for row in rows:
        legacy_id = row[0]
        old_vals = row[1:]
        new_vals = tuple(clean_text(v) for v in old_vals)
        if new_vals != old_vals:
            updates.append((legacy_id, new_vals))

    print(f"Rows that would actually change: {len(updates)}")
    if updates:
        sample_id, sample_new = updates[0]
        print(f"\n--- sample (legacy_trade_id={sample_id}) ---")
        for col, before, after in zip(NOTE_COLUMNS, rows[0][1:], sample_new):
            if before != after:
                print(f"[{col}] before: {before!r}")
                print(f"[{col}] after:  {after!r}")

    if not args.apply:
        print("\nDry run. Re-run with --apply to write the changes.")
        return 0

    if not updates:
        print("\nNothing to do.")
        return 0

    set_clause = ", ".join(f"{c} = %s" for c in NOTE_COLUMNS)
    sql = f"UPDATE trade_journal SET {set_clause} WHERE legacy_trade_id = %s"
    for legacy_id, new_vals in updates:
        cur.execute(sql, (*new_vals, legacy_id))
    conn.commit()
    print(f"\nUpdated {len(updates)} rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
