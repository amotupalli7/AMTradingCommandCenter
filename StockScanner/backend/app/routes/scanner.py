import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scanner", tags=["scanner"])


@router.get("/state")
async def get_state(request: Request) -> dict:
    hub = request.app.state.scanner_hub
    payload = hub.latest or hub.read_now()
    if payload is None:
        raise HTTPException(status_code=503, detail="scanner data file not available yet")
    return payload


ws_router = APIRouter()


@ws_router.websocket("/ws/scanner")
async def ws_scanner(ws: WebSocket) -> None:
    hub = ws.app.state.scanner_hub
    await ws.accept()
    q = await hub.subscribe()
    try:
        while True:
            payload = await q.get()
            await ws.send_json(payload)
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("ws_scanner client error")
    finally:
        await hub.unsubscribe(q)
