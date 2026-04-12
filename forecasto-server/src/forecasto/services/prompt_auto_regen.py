"""Automatic prompt regeneration triggered by record creation events."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import async_session_maker
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember

logger = logging.getLogger(__name__)

# Configurable thresholds
REGEN_THRESHOLD = 20  # new records before triggering regen
REGEN_COOLDOWN_SECONDS = 3600  # 1 hour minimum between regenerations


async def increment_workspace_record_counter(
    workspace_id: str,
    db: AsyncSession,
    count: int = 1,
) -> None:
    """Increment the records-since-last-regen counter in workspace settings."""
    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        return

    settings = dict(workspace.settings or {})
    current = settings.get("agent_prompt_records_since_regen", 0)
    settings["agent_prompt_records_since_regen"] = current + count
    workspace.settings = settings
    # The caller's session will commit this


async def maybe_trigger_workspace_regen(
    workspace_id: str,
    db: AsyncSession,
) -> None:
    """Check if workspace prompt should be auto-regenerated and launch background task if so."""
    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        return

    settings = workspace.settings or {}

    # Check auto_update flag
    if not settings.get("agent_prompt_auto_update"):
        return

    # Need an existing prompt to update (don't auto-generate from scratch)
    if not settings.get("agent_prompt"):
        return

    # Check threshold
    counter = settings.get("agent_prompt_records_since_regen", 0)
    if counter < REGEN_THRESHOLD:
        return

    # Check cooldown
    now = datetime.now(timezone.utc)
    last_regen_str = settings.get("agent_prompt_last_auto_regen")
    if last_regen_str:
        try:
            last_regen = datetime.fromisoformat(last_regen_str)
            if last_regen.tzinfo is None:
                last_regen = last_regen.replace(tzinfo=timezone.utc)
            if (now - last_regen).total_seconds() < REGEN_COOLDOWN_SECONDS:
                logger.debug(
                    "Workspace %s: cooldown active, skipping auto-regen", workspace_id
                )
                return
        except (ValueError, TypeError):
            pass

    # Reset counter and set timestamp before launching task
    settings = dict(settings)
    settings["agent_prompt_records_since_regen"] = 0
    settings["agent_prompt_last_auto_regen"] = now.isoformat()
    workspace.settings = settings

    # Find workspace owner for tracking
    owner_result = await db.execute(
        select(WorkspaceMember.user_id).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.role == "owner",
        ).limit(1)
    )
    owner_row = owner_result.first()
    if not owner_row:
        return

    owner_user_id = owner_row[0]

    logger.info(
        "Auto-regen triggered for workspace %s (counter=%d, owner=%s)",
        workspace_id, counter, owner_user_id,
    )

    # Launch background task with its own DB session
    asyncio.create_task(
        _run_workspace_regen(workspace_id, owner_user_id),
        name=f"auto-regen-ws-{workspace_id}",
    )


async def _run_workspace_regen(workspace_id: str, user_id: str) -> None:
    """Background task: regenerate workspace prompt using its own DB session."""
    try:
        async with async_session_maker() as db:
            from forecasto.services.prompt_builder_service import PromptBuilderService

            service = PromptBuilderService(db)

            # Get existing prompt
            result = await db.execute(
                select(Workspace).where(Workspace.id == workspace_id)
            )
            workspace = result.scalar_one_or_none()
            if not workspace:
                return

            existing = (workspace.settings or {}).get("agent_prompt")
            if not existing:
                return

            prompt_text, usage, records_count = await service.generate_workspace_prompt(
                workspace_id=workspace_id,
                user_id=user_id,
                existing_prompt=existing,
            )

            await service.save_workspace_prompt(workspace_id, prompt_text)
            await service.track_generation(
                user_id=user_id,
                workspace_id=workspace_id,
                scope="workspace",
                usage=usage,
                prompt_text=prompt_text,
                status="completed",
                records_analyzed=records_count,
            )
            await db.commit()

            logger.info(
                "Auto-regen completed for workspace %s: %d records, %d tokens",
                workspace_id,
                records_count,
                usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
            )

            # Publish event for SSE clients
            from forecasto.services.event_bus import event_bus
            await event_bus.publish(
                "prompt_regenerated",
                workspace_id=workspace_id,
                data={"action": "auto_regen", "records_analyzed": records_count},
            )

            # Check if user also has auto_update enabled
            await _maybe_trigger_user_regen(user_id)

    except Exception:
        logger.exception("Auto-regen failed for workspace %s", workspace_id)


async def _maybe_trigger_user_regen(user_id: str) -> None:
    """Check and trigger user-level prompt auto-regeneration."""
    try:
        async with async_session_maker() as db:
            from forecasto.services.prompt_builder_service import PromptBuilderService

            result = await db.execute(
                select(User).where(User.id == user_id)
            )
            user = result.scalar_one_or_none()
            if not user or not user.agent_prompt_auto_update or not user.agent_prompt:
                return

            service = PromptBuilderService(db)
            prompt_text, usage, records_count = await service.generate_user_prompt(
                user_id=user_id,
                existing_prompt=user.agent_prompt,
            )

            await service.save_user_prompt(user_id, prompt_text)
            await service.track_generation(
                user_id=user_id,
                workspace_id=None,
                scope="user",
                usage=usage,
                prompt_text=prompt_text,
                status="completed",
                records_analyzed=records_count,
            )
            await db.commit()

            logger.info(
                "Auto-regen completed for user %s: %d records, %d tokens",
                user_id, records_count,
                usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
            )

    except Exception:
        logger.exception("User auto-regen failed for user %s", user_id)
