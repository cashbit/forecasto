"""In-process scheduler for Agente-zero incremental note analysis.

Periodically analyzes records whose analyzed fields changed and that have been
settled for at least `agent_zero_delay_seconds`. Mirrors the lifecycle of
`InboxCleanupScheduler` (start/stop in the FastAPI lifespan).
"""

from __future__ import annotations

import asyncio
import logging

from forecasto.config import settings
from forecasto.database import async_session_maker
from forecasto.services.agent_zero.service import AgentZeroService

logger = logging.getLogger(__name__)


class AgentZeroScheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        if self._task is not None or not settings.agent_zero_enabled:
            if not settings.agent_zero_enabled:
                logger.info("Agente-zero scheduler disabled (agent_zero_enabled=False)")
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info(
            "Agente-zero scheduler started (poll=%ds, delay=%ds, model=%s)",
            settings.agent_zero_poll_seconds,
            settings.agent_zero_delay_seconds,
            settings.agent_zero_model,
        )

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        logger.info("Agente-zero scheduler stopped")

    async def run_once(self) -> dict:
        async with async_session_maker() as db:
            service = AgentZeroService(db)
            return await service.analyze_stale(trigger="scheduler")

    async def _loop(self) -> None:
        interval = max(30, settings.agent_zero_poll_seconds)
        while self._running:
            try:
                stats = await self.run_once()
                if stats.get("analyzed", 0) or stats.get("llm_calls", 0):
                    logger.info("Agente-zero pass: %s", stats)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.exception("Agente-zero pass failed: %s", exc)
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break


agent_zero_scheduler = AgentZeroScheduler()
