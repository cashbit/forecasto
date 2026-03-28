"""In-memory event bus for real-time SSE notifications."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Event:
    """An event to be sent to connected clients."""

    event_type: str
    workspace_id: str | None
    data: dict[str, Any]
    timestamp: float = field(default_factory=time.time)

    def to_sse(self) -> str:
        """Format as SSE message."""
        payload = {
            "workspace_id": self.workspace_id,
            **self.data,
        }
        return f"event: {self.event_type}\ndata: {json.dumps(payload)}\n\n"


@dataclass
class Subscriber:
    """A connected SSE client."""

    user_id: str
    queue: asyncio.Queue[Event | None] = field(default_factory=asyncio.Queue)


class EventBus:
    """Simple in-memory pub/sub for SSE notifications."""

    def __init__(self) -> None:
        self._subscribers: list[Subscriber] = []

    def subscribe(self, user_id: str) -> Subscriber:
        """Register a new subscriber. Returns the Subscriber (caller reads from its queue)."""
        sub = Subscriber(user_id=user_id)
        self._subscribers.append(sub)
        return sub

    def unsubscribe(self, sub: Subscriber) -> None:
        """Remove a subscriber."""
        try:
            self._subscribers.remove(sub)
        except ValueError:
            pass

    async def publish(
        self,
        event_type: str,
        workspace_id: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> None:
        """Broadcast an event to all connected subscribers."""
        event = Event(
            event_type=event_type,
            workspace_id=workspace_id,
            data=data or {},
        )
        for sub in self._subscribers:
            try:
                sub.queue.put_nowait(event)
            except asyncio.QueueFull:
                # Drop oldest event if queue is full (subscriber is slow)
                try:
                    sub.queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                sub.queue.put_nowait(event)


# Singleton instance
event_bus = EventBus()
