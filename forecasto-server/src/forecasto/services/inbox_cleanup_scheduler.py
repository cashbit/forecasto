"""In-process scheduler for inbox data-retention cleanup.

Periodically sweeps `inbox_items` and deletes source files from disk for:
  - confirmed items (file no longer needed, kept only for audit)
  - rejected items past their retention window
  - soft-deleted items

The first sweep runs at startup (acts as backfill for pre-existing rows).
Follows the same async-task lifecycle as `ProcessingQueue` (start/stop in
the FastAPI lifespan).
"""

from __future__ import annotations

import asyncio
import logging

from forecasto.config import settings
from forecasto.database import async_session_maker
from forecasto.services.inbox_service import InboxService

logger = logging.getLogger(__name__)


class InboxCleanupScheduler:
    """Singleton — runs `InboxService.cleanup_expired_files()` on a fixed loop."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        if self._task is not None:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info(
            "Inbox cleanup scheduler started (interval=%d min, retention=%d days)",
            settings.inbox_cleanup_interval_minutes,
            settings.inbox_rejected_retention_days,
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
        logger.info("Inbox cleanup scheduler stopped")

    async def run_once(self) -> dict[str, int]:
        """Run a single cleanup pass. Exposed for manual triggers / tests."""
        async with async_session_maker() as db:
            service = InboxService(db)
            return await service.cleanup_expired_files()

    async def _loop(self) -> None:
        interval = max(60, settings.inbox_cleanup_interval_minutes * 60)
        # First sweep runs immediately — acts as one-shot backfill on startup.
        while self._running:
            try:
                stats = await self.run_once()
                if stats.get("scanned", 0) > 0:
                    logger.info("Inbox cleanup pass: %s", stats)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("Inbox cleanup pass failed: %s", exc)
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break


inbox_cleanup_scheduler = InboxCleanupScheduler()
