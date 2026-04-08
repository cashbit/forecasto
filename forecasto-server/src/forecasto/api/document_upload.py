"""Document upload and processing job endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, UploadFile, File, Response
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.config import settings
from forecasto.database import get_db
from forecasto.dependencies import get_current_user, get_current_workspace
from forecasto.exceptions import ForbiddenException, NotFoundException, UnauthorizedException
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.document_processing import (
    DocumentUploadResponse,
    ProcessingJobResponse,
    QueueStatusResponse,
    UsageRecordResponse,
    UsageSummaryResponse,
)
from forecasto.services.document_processing_service import DocumentProcessingService
from forecasto.services.inbox_service import InboxService
from forecasto.services.processing_queue import QueueFullError, processing_queue

router = APIRouter()


# ---------------------------------------------------------------------------
# Upload endpoint -- accepts JWT or X-Agent-Token
# ---------------------------------------------------------------------------

@router.post("/{workspace_id}/inbox/upload", response_model=dict, status_code=202)
async def upload_document(
    workspace_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    x_agent_token: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
    # JWT auth is handled separately -- we check for all three
):
    """Upload a document for server-side processing.

    Accepts JWT (web), X-Agent-Token, or X-API-Key auth.
    Returns 202 with job_id -- processing happens in background.
    """
    user_id = None
    upload_source = "web"

    # Try agent token auth
    if x_agent_token:
        inbox_service = InboxService(db)
        user = await inbox_service.get_user_from_agent_token(x_agent_token)
        if not user:
            raise ForbiddenException("Agent token non valido")
        if not await inbox_service.verify_agent_workspace_access(user.id, workspace_id):
            raise ForbiddenException("Accesso al workspace non autorizzato")
        user_id = user.id
        upload_source = "agent"
    elif x_api_key:
        inbox_service = InboxService(db)
        api_key_ws = await inbox_service.get_workspace_id_from_api_key(x_api_key)
        if api_key_ws != workspace_id:
            raise ForbiddenException("API key non autorizzata")
        upload_source = "agent"
    else:
        # Fall back to JWT -- use get_current_workspace dependency manually
        raise UnauthorizedException("Autenticazione richiesta")

    # Read file
    file_bytes = await file.read()
    content_type = file.content_type or "application/octet-stream"
    filename = file.filename or "document"

    service = DocumentProcessingService(db)
    try:
        job = await service.upload_document(
            workspace_id=workspace_id,
            file_bytes=file_bytes,
            filename=filename,
            content_type=content_type,
            upload_source=upload_source,
            user_id=user_id,
        )
        await db.commit()
    except QueueFullError:
        return Response(
            content='{"error": "Coda elaborazione piena. Riprova tra qualche minuto."}',
            status_code=429,
            headers={"Retry-After": "60"},
            media_type="application/json",
        )
    except ValueError as e:
        return Response(
            content=f'{{"error": "{str(e)}"}}',
            status_code=400,
            media_type="application/json",
        )

    return {
        "success": True,
        "job_id": job.id,
        "status": job.status,
        "source_filename": job.source_filename,
        "queue_position": processing_queue.queued_count,
    }


# JWT-authenticated upload (separate endpoint so FastAPI resolves the dependency)
@router.post("/{workspace_id}/inbox/upload-web", response_model=dict, status_code=202)
async def upload_document_web(
    workspace_id: str,
    file: UploadFile = File(...),
    workspace_data: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document via web interface (JWT auth)."""
    file_bytes = await file.read()
    content_type = file.content_type or "application/octet-stream"
    filename = file.filename or "document"

    service = DocumentProcessingService(db)
    try:
        job = await service.upload_document(
            workspace_id=workspace_id,
            file_bytes=file_bytes,
            filename=filename,
            content_type=content_type,
            upload_source="web",
            user_id=current_user.id,
        )
        await db.commit()
    except QueueFullError:
        return Response(
            content='{"error": "Coda elaborazione piena. Riprova tra qualche minuto."}',
            status_code=429,
            headers={"Retry-After": "60"},
            media_type="application/json",
        )
    except ValueError as e:
        return Response(
            content=f'{{"error": "{str(e)}"}}',
            status_code=400,
            media_type="application/json",
        )

    return {
        "success": True,
        "job_id": job.id,
        "status": job.status,
        "source_filename": job.source_filename,
        "queue_position": processing_queue.queued_count,
    }


@router.get("/{workspace_id}/inbox/jobs/{job_id}", response_model=dict)
async def get_processing_job(
    workspace_id: str,
    job_id: str,
    workspace_data: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    """Get status of a processing job."""
    service = DocumentProcessingService(db)
    job = await service.get_job(workspace_id, job_id)
    if not job:
        raise NotFoundException("Job non trovato")

    # Load usage if available
    usage = None
    if job.usage_record:
        usage = UsageRecordResponse.model_validate(job.usage_record)

    return {
        "success": True,
        "job": ProcessingJobResponse(
            id=job.id,
            workspace_id=job.workspace_id,
            status=job.status,
            source_filename=job.source_filename,
            source_hash=job.source_hash,
            file_size_bytes=job.file_size_bytes,
            file_content_type=job.file_content_type,
            upload_source=job.upload_source,
            llm_model=job.llm_model,
            inbox_item_id=job.inbox_item_id,
            error_message=job.error_message,
            started_at=job.started_at,
            completed_at=job.completed_at,
            created_at=job.created_at,
            usage=usage,
        ),
    }


@router.get("/{workspace_id}/inbox/jobs", response_model=dict)
async def list_processing_jobs(
    workspace_id: str,
    workspace_data: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List recent processing jobs."""
    service = DocumentProcessingService(db)
    jobs, total = await service.list_jobs(workspace_id, status=status, limit=limit, offset=offset)
    return {
        "success": True,
        "jobs": [
            ProcessingJobResponse(
                id=j.id, workspace_id=j.workspace_id, status=j.status,
                source_filename=j.source_filename, source_hash=j.source_hash,
                file_size_bytes=j.file_size_bytes, file_content_type=j.file_content_type,
                upload_source=j.upload_source, llm_model=j.llm_model,
                inbox_item_id=j.inbox_item_id, error_message=j.error_message,
                started_at=j.started_at, completed_at=j.completed_at,
                created_at=j.created_at,
            )
            for j in jobs
        ],
        "total": total,
    }


@router.get("/{workspace_id}/inbox/queue", response_model=QueueStatusResponse)
async def get_queue_status(
    workspace_id: str,
    workspace_data: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
):
    """Get current processing queue status."""
    return QueueStatusResponse(
        queued=processing_queue.queued_count,
        processing=processing_queue.processing_count,
        max_concurrent=settings.processing_max_concurrent,
        max_queue_size=settings.processing_max_queue_size,
    )
