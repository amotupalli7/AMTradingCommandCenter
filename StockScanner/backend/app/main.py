import asyncio
import logging
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db.session import connect
from .enrichment import dt as dt_module
from .enrichment import rename as rename_module
from .market.live_hub import hub as live_trade_hub
from .routes import candles as candles_routes
from .routes import enrich as enrich_routes
from .routes import scanner as scanner_routes
from .scanner_bridge.watcher import ScannerHub, run_watcher

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    hub = ScannerHub(settings.SCANNER_DATA_FILE)
    app.state.scanner_hub = hub
    watcher_task = asyncio.create_task(run_watcher(hub), name="scanner-watcher")

    # Live trade hub for chart panes (separate Polygon WS, per-ticker subs)
    live_trade_hub.start(asyncio.get_running_loop())

    # Ticker-rename db (FMP) loaded once; lookups are then in-process dict access.
    asyncio.create_task(rename_module.init())

    try:
        yield
    finally:
        # Stop live WS before scanner watcher so Polygon sees a clean disconnect.
        live_trade_hub.stop()
        dt_module.shutdown()  # quit the persistent Chrome session if it spawned
        watcher_task.cancel()
        try:
            await watcher_task
        except (asyncio.CancelledError, Exception):
            pass


app = FastAPI(title="StockScanner API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scanner_routes.router)
app.include_router(scanner_routes.ws_router)
app.include_router(candles_routes.router)
app.include_router(candles_routes.ws_router)
app.include_router(enrich_routes.router)


@app.get("/api/health")
def health() -> dict:
    db_ok = False
    db_error: str | None = None
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            db_ok = cur.fetchone()["ok"] == 1
    except psycopg.Error as e:
        db_error = str(e).strip().splitlines()[0] if str(e) else type(e).__name__

    scanner_file_exists = settings.SCANNER_DATA_FILE.exists()

    return {
        "status": "ok" if db_ok else "degraded",
        "db": {"ok": db_ok, "error": db_error, "name": settings.PG_DB},
        "scanner_data_file": {
            "path": str(settings.SCANNER_DATA_FILE),
            "exists": scanner_file_exists,
        },
        "polygon_key_configured": bool(settings.POLYGON_API_KEY),
    }
