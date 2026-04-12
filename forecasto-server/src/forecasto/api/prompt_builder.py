"""Prompt builder API endpoints."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user, get_current_workspace
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.prompt_builder import (
    AgentPromptResponse,
    AgentPromptUpdate,
    GeneratePromptRequest,
    GeneratePromptResponse,
    PatternAnalysisResponse,
    PromptGenerationJobResponse,
    PromptUsageInfo,
    UsageSummaryListResponse,
    UsageSummaryResponse,
)
from forecasto.services.prompt_builder_service import PromptBuilderService

logger = logging.getLogger(__name__)
router = APIRouter()


def _require_owner_or_admin(member: WorkspaceMember) -> None:
    if member.role not in ("owner", "admin"):
        raise HTTPException(403, "Solo owner o admin possono eseguire questa azione")


# ── Workspace prompt ──────────────────────────────────────────


@router.post("/workspaces/{workspace_id}/generate-prompt", response_model=GeneratePromptResponse)
async def generate_workspace_prompt(
    workspace_id: str,
    workspace_data: Annotated[tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: GeneratePromptRequest | None = None,
):
    """Generate or update the workspace agent prompt from record patterns."""
    workspace, member = workspace_data
    _require_owner_or_admin(member)

    service = PromptBuilderService(db)
    existing = (workspace.settings or {}).get("agent_prompt") if not (body and body.force_regenerate) else None

    try:
        prompt_text, usage, records_count = await service.generate_workspace_prompt(
            workspace_id=workspace_id,
            user_id=current_user.id,
            existing_prompt=existing,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("Prompt generation failed")
        await service.track_generation(
            user_id=current_user.id,
            workspace_id=workspace_id,
            scope="workspace",
            usage={"input_tokens": 0, "output_tokens": 0, "model": "error"},
            prompt_text="",
            status="failed",
            records_analyzed=0,
            error_message=str(e),
        )
        await db.commit()
        raise HTTPException(500, f"Errore nella generazione del prompt: {e}")

    # Save prompt + track usage
    await service.save_workspace_prompt(workspace_id, prompt_text)
    await service.track_generation(
        user_id=current_user.id,
        workspace_id=workspace_id,
        scope="workspace",
        usage=usage,
        prompt_text=prompt_text,
        status="completed",
        records_analyzed=records_count,
    )
    await db.commit()

    cost = (
        usage.get("input_tokens", 0) * 0.80 * 0.92 / 1_000_000
        + usage.get("output_tokens", 0) * 4.00 * 0.92 / 1_000_000
    )

    return GeneratePromptResponse(
        prompt=prompt_text,
        is_update=existing is not None,
        usage=PromptUsageInfo(
            input_tokens=usage["input_tokens"],
            output_tokens=usage["output_tokens"],
            total_cost_eur=round(cost, 6),
            model=usage["model"],
        ),
        records_analyzed=records_count,
    )


@router.get("/workspaces/{workspace_id}/agent-prompt", response_model=AgentPromptResponse)
async def get_workspace_prompt(
    workspace_id: str,
    workspace_data: Annotated[tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get the current workspace agent prompt."""
    workspace, _ = workspace_data
    prompt = (workspace.settings or {}).get("agent_prompt")

    # Get last generation info
    from forecasto.models.prompt_generation import PromptGenerationJob
    from sqlalchemy import select

    result = await db.execute(
        select(PromptGenerationJob).where(
            PromptGenerationJob.workspace_id == workspace_id,
            PromptGenerationJob.scope == "workspace",
            PromptGenerationJob.status == "completed",
        ).order_by(PromptGenerationJob.created_at.desc()).limit(1)
    )
    last_job = result.scalar_one_or_none()

    settings = workspace.settings or {}
    return AgentPromptResponse(
        prompt=prompt,
        last_generated_at=last_job.created_at if last_job else None,
        records_analyzed=last_job.records_analyzed if last_job else 0,
        auto_update=bool(settings.get("agent_prompt_auto_update", False)),
        records_since_regen=settings.get("agent_prompt_records_since_regen", 0),
    )


@router.put("/workspaces/{workspace_id}/agent-prompt")
async def update_workspace_prompt(
    workspace_id: str,
    workspace_data: Annotated[tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: AgentPromptUpdate,
):
    """Manually update the workspace agent prompt and/or auto_update flag."""
    workspace, member = workspace_data
    _require_owner_or_admin(member)

    service = PromptBuilderService(db)

    if body.prompt is not None:
        await service.save_workspace_prompt(workspace_id, body.prompt)

    if body.auto_update is not None:
        settings = dict(workspace.settings or {})
        settings["agent_prompt_auto_update"] = body.auto_update
        if not body.auto_update:
            # Reset counter when disabling
            settings["agent_prompt_records_since_regen"] = 0
        workspace.settings = settings

    await db.commit()
    return {"success": True}


@router.get("/workspaces/{workspace_id}/record-patterns", response_model=PatternAnalysisResponse)
async def get_record_patterns(
    workspace_id: str,
    workspace_data: Annotated[tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Analyze record patterns (pure SQL, no LLM cost)."""
    _, member = workspace_data
    _require_owner_or_admin(member)

    service = PromptBuilderService(db)
    patterns = await service.analyze_workspace_patterns(workspace_id)
    return PatternAnalysisResponse(
        total_records=patterns["total_records"],
        account_frequency=patterns["account_frequency"],
        reference_account_mapping=patterns["reference_account_mapping"],
        reference_total_patterns=patterns["reference_total_patterns"],
        type_area_mapping=patterns["type_area_mapping"],
        vat_deduction_patterns=patterns["vat_deduction_patterns"],
        withholding_patterns=patterns["withholding_patterns"],
        project_account_mapping=patterns["project_account_mapping"],
        stage_patterns=patterns["stage_patterns"],
        payment_terms=patterns["payment_terms"],
    )


@router.get("/workspaces/{workspace_id}/prompt-history", response_model=list[PromptGenerationJobResponse])
async def get_prompt_history(
    workspace_id: str,
    workspace_data: Annotated[tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get prompt generation history for a workspace."""
    _, member = workspace_data
    _require_owner_or_admin(member)

    service = PromptBuilderService(db)
    jobs = await service.get_generation_history(workspace_id)
    return [PromptGenerationJobResponse.model_validate(j) for j in jobs]


# ── User prompt ───────────────────────────────────────────────


@router.post("/users/me/generate-prompt", response_model=GeneratePromptResponse)
async def generate_user_prompt(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: GeneratePromptRequest | None = None,
):
    """Generate or update the user-level agent prompt from all owned workspaces."""
    service = PromptBuilderService(db)
    existing = current_user.agent_prompt if not (body and body.force_regenerate) else None

    try:
        prompt_text, usage, records_count = await service.generate_user_prompt(
            user_id=current_user.id,
            existing_prompt=existing,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("User prompt generation failed")
        raise HTTPException(500, f"Errore nella generazione del prompt: {e}")

    await service.save_user_prompt(current_user.id, prompt_text)
    await service.track_generation(
        user_id=current_user.id,
        workspace_id=None,
        scope="user",
        usage=usage,
        prompt_text=prompt_text,
        status="completed",
        records_analyzed=records_count,
    )
    await db.commit()

    cost = (
        usage.get("input_tokens", 0) * 0.80 * 0.92 / 1_000_000
        + usage.get("output_tokens", 0) * 4.00 * 0.92 / 1_000_000
    )

    return GeneratePromptResponse(
        prompt=prompt_text,
        is_update=existing is not None,
        usage=PromptUsageInfo(
            input_tokens=usage["input_tokens"],
            output_tokens=usage["output_tokens"],
            total_cost_eur=round(cost, 6),
            model=usage["model"],
        ),
        records_analyzed=records_count,
    )


@router.get("/users/me/agent-prompt", response_model=AgentPromptResponse)
async def get_user_prompt(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Get the current user agent prompt."""
    return AgentPromptResponse(
        prompt=current_user.agent_prompt,
        auto_update=current_user.agent_prompt_auto_update,
    )


@router.put("/users/me/agent-prompt")
async def update_user_prompt(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: AgentPromptUpdate,
):
    """Manually update the user agent prompt and/or auto_update flag."""
    service = PromptBuilderService(db)

    if body.prompt is not None:
        await service.save_user_prompt(current_user.id, body.prompt)

    if body.auto_update is not None:
        current_user.agent_prompt_auto_update = body.auto_update

    await db.commit()
    return {"success": True}


@router.get("/users/me/prompt-usage", response_model=UsageSummaryListResponse)
async def get_prompt_usage(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get token usage summary per month."""
    service = PromptBuilderService(db)
    months = await service.get_usage_summary(current_user.id)
    return UsageSummaryListResponse(
        months=[UsageSummaryResponse(**m) for m in months]
    )
