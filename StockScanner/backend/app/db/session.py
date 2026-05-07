from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from ..config import settings


# Pool sized for: chart endpoints (3 sequential queries each), the scanner
# watcher's read path, and occasional one-shot health/setup queries.
_pool = ConnectionPool(
    conninfo=settings.pg_dsn,
    min_size=1, max_size=8,
    kwargs={"row_factory": dict_row},
    open=False,
)


def _ensure_open() -> None:
    if _pool.closed:
        _pool.open(wait=True, timeout=5.0)


def connect() -> psycopg.Connection:
    """Borrow a connection from the pool. Use as a context manager — returning
    on exit puts the connection back."""
    _ensure_open()
    return _pool.connection()


@contextmanager
def cursor() -> Iterator[psycopg.Cursor]:
    with connect() as conn, conn.cursor() as cur:
        yield cur
        conn.commit()
