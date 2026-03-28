"""SSE (Server-Sent Events) endpoint for real-time notifications."""

from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from forecasto.dependencies import get_current_user
from forecasto.models.user import User
from forecasto.services.event_bus import event_bus

router = APIRouter()

HEARTBEAT_INTERVAL = 30  # seconds


async def _event_stream(user: User):
    """Generator that yields SSE events for the connected user."""
    sub = event_bus.subscribe(user.id)
    try:
        while True:
            try:
                event = await asyncio.wait_for(sub.queue.get(), timeout=HEARTBEAT_INTERVAL)
                if event is None:
                    # Shutdown signal
                    break
                yield event.to_sse()
            except asyncio.TimeoutError:
                # Send heartbeat to keep connection alive
                yield ": heartbeat\n\n"
    finally:
        event_bus.unsubscribe(sub)


@router.get("/events/stream")
async def event_stream(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """SSE endpoint — streams real-time events to the authenticated client."""
    return StreamingResponse(
        _event_stream(current_user),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
