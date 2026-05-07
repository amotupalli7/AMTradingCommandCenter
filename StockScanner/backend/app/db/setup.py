"""Bootstrap scanner_db: create the database if missing, then apply schema.sql.

Run with:  python -m app.db.setup    (from the backend/ directory)
"""
from pathlib import Path

import psycopg

from ..config import settings


SCHEMA_FILE = Path(__file__).parent / "schema.sql"


def ensure_database() -> None:
    with psycopg.connect(settings.pg_dsn_admin, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (settings.PG_DB,))
        if cur.fetchone() is None:
            cur.execute(f'CREATE DATABASE "{settings.PG_DB}"')
            print(f"created database {settings.PG_DB}")
        else:
            print(f"database {settings.PG_DB} already exists")


def apply_schema() -> None:
    sql = SCHEMA_FILE.read_text(encoding="utf-8")
    with psycopg.connect(settings.pg_dsn) as conn, conn.cursor() as cur:
        cur.execute(sql)
        conn.commit()
    print(f"schema applied from {SCHEMA_FILE.name}")


def main() -> None:
    ensure_database()
    apply_schema()


if __name__ == "__main__":
    main()
