import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from ..market import candles as candles_store
from ..market.live_hub import hub as live_hub

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/candles", tags=["candles"])
ws_router = APIRouter()


@router.get("/{ticker}")
async def get_candles(
    ticker: str,
    tf: str = Query("1m"),
    from_ms: int | None = Query(None),
    to_ms: int | None = Query(None),
    days: int = Query(1, ge=1, le=3650, description="convenience: last N calendar days"),
    refresh: bool = Query(False, description="if true, re-fetch the entire window from Polygon and overwrite the DB cache (use to recover from gaps the normal hole-fill missed)"),
):
    ticker = ticker.upper()
    if tf in candles_store.INTRADAY_TF_SECONDS:
        if to_ms is None:
            to_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        if from_ms is None:
            from_ms = to_ms - days * 86_400_000
        try:
            rows = await candles_store.get_intraday(ticker, from_ms, to_ms, tf, force_refresh=refresh)
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))
        return {"ticker": ticker, "tf": tf, "from_ms": from_ms, "to_ms": to_ms, "bars": rows}

    if tf == "D":
        today = datetime.now(timezone.utc).date()
        to_d = today
        from_d = today - timedelta(days=days)
        try:
            rows = await candles_store.get_daily(ticker, from_d, to_d)
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))
        return {"ticker": ticker, "tf": "D", "from_date": from_d.isoformat(),
                "to_date": to_d.isoformat(), "bars": rows}

    raise HTTPException(status_code=400, detail=f"unsupported tf: {tf}")


@ws_router.websocket("/ws/candles/{ticker}")
async def ws_candles(ws: WebSocket, ticker: str) -> None:
    ticker = ticker.upper()
    await ws.accept()
    q = await live_hub.subscribe(ticker)
    try:
        while True:
            event = await q.get()
            await ws.send_json(event)
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("ws_candles error for %s", ticker)
    finally:
        await live_hub.unsubscribe(ticker, q)
