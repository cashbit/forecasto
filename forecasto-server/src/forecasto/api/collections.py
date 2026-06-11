"""Collection endpoints — schema-less document store per workspace.

User endpoints authenticate via JWT (`get_current_workspace`); machine
ingestion endpoints authenticate via `X-Agent-Token` / `X-API-Key`, exactly
like the inbox agent endpoints.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import (
    check_collection_permission,
    get_current_user,
    get_current_workspace,
)
from forecasto.exceptions import ForbiddenException, UnauthorizedException
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.collection import (
    CollectionCreate,
    CollectionDocumentCreate,
    CollectionDocumentResponse,
    CollectionDocumentUpdate,
    CollectionResponse,
    CollectionUpdate,
    DocumentAggregateQuery,
    DocumentQuery,
    DocumentRouteRequest,
    QuarantineCountResponse,
)
from forecasto.services.collection_service import CollectionService, project_data
from forecasto.services.event_bus import event_bus

router = APIRouter()

WorkspaceDep = Annotated[tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)]


def _serialize_documents(docs, fields: list[str] | None) -> list[CollectionDocumentResponse]:
    """Map ORM docs to responses, optionally projecting `data` to `fields` only.

    Projection reassigns `r.data` (never mutates the ORM object, which would
    otherwise persist the trimmed payload at commit time)."""
    responses = []
    for d in docs:
        r = CollectionDocumentResponse.model_validate(d)
        if fields:
            r.data = project_data(d.data or {}, fields)
        responses.append(r)
    return responses


def _require_collection_admin(member: WorkspaceMember) -> None:
    """Structural collection mutations (update/delete a collection, quarantine
    routing/discard) remain owner/admin only."""
    if member.role not in ("owner", "admin"):
        raise ForbiddenException("Solo owner o admin possono modificare le collezioni")


async def _authenticate_machine(
    service: CollectionService,
    workspace_id: str,
    x_api_key: str | None,
    x_agent_token: str | None,
) -> None:
    """Authenticate an agent/API-key caller for the given workspace (inbox parity)."""
    if x_agent_token:
        user = await service.get_user_from_agent_token(x_agent_token)
        if not user:
            raise ForbiddenException("Agent token non valido")
        if not await service.verify_agent_workspace_access(user.id, workspace_id):
            raise ForbiddenException("Accesso al workspace non autorizzato")
    elif x_api_key:
        api_key_workspace_id = await service.get_workspace_id_from_api_key(x_api_key)
        if api_key_workspace_id != workspace_id:
            raise ForbiddenException("API key non autorizzata per questo workspace")
    else:
        raise UnauthorizedException("Autenticazione richiesta: X-Agent-Token o X-API-Key")


# ---------------------------------------------------------------------------
# Collections (user, JWT)
# ---------------------------------------------------------------------------

@router.post("/{workspace_id}/collections", response_model=dict, status_code=201)
async def create_collection(
    workspace_id: str,
    data: CollectionCreate,
    workspace_data: WorkspaceDep,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "create")
    service = CollectionService(db)
    collection = await service.create_collection(workspace_id, data, user_id=current_user.id)
    await db.commit()
    await event_bus.publish(
        "collections_changed",
        workspace_id=workspace_id,
        data={"action": "create", "collection_id": collection.id},
    )
    return {"success": True, "collection": CollectionResponse.model_validate(collection)}


@router.get("/{workspace_id}/collections", response_model=dict)
async def list_collections(
    workspace_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
    include_archived: bool = Query(False),
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    service = CollectionService(db)
    collections = await service.list_collections(workspace_id, include_archived=include_archived)
    return {
        "success": True,
        "collections": [CollectionResponse.model_validate(c) for c in collections],
    }


@router.get("/{workspace_id}/collections/{collection_id}", response_model=dict)
async def get_collection(
    workspace_id: str,
    collection_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    service = CollectionService(db)
    collection = await service.get_collection(workspace_id, collection_id)
    return {"success": True, "collection": CollectionResponse.model_validate(collection)}


@router.patch("/{workspace_id}/collections/{collection_id}", response_model=dict)
async def update_collection(
    workspace_id: str,
    collection_id: str,
    data: CollectionUpdate,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    _require_collection_admin(member)
    service = CollectionService(db)
    collection = await service.update_collection(workspace_id, collection_id, data)
    await db.commit()
    await event_bus.publish(
        "collections_changed",
        workspace_id=workspace_id,
        data={"action": "update", "collection_id": collection_id},
    )
    return {"success": True, "collection": CollectionResponse.model_validate(collection)}


@router.delete("/{workspace_id}/collections/{collection_id}", response_model=dict)
async def delete_collection(
    workspace_id: str,
    collection_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    _require_collection_admin(member)
    service = CollectionService(db)
    await service.delete_collection(workspace_id, collection_id)
    await db.commit()
    await event_bus.publish(
        "collections_changed",
        workspace_id=workspace_id,
        data={"action": "delete", "collection_id": collection_id},
    )
    return {"success": True}


# ---------------------------------------------------------------------------
# Documents (user, JWT) — static suffixes declared before {document_id}
# ---------------------------------------------------------------------------

@router.get("/{workspace_id}/collections/{collection_id}/documents", response_model=dict)
async def list_documents(
    workspace_id: str,
    collection_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    fields: list[str] | None = Query(None),
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    service = CollectionService(db)
    docs, total = await service.list_documents(workspace_id, collection_id, limit=limit, offset=offset)
    return {
        "success": True,
        "documents": _serialize_documents(docs, fields),
        "total": total,
    }


@router.post("/{workspace_id}/collections/{collection_id}/documents/query", response_model=dict)
async def query_documents(
    workspace_id: str,
    collection_id: str,
    query: DocumentQuery,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    service = CollectionService(db)
    docs, total = await service.query_documents(workspace_id, collection_id, query)
    return {
        "success": True,
        "documents": _serialize_documents(docs, query.fields),
        "total": total,
    }


@router.post("/{workspace_id}/collections/{collection_id}/documents/aggregate", response_model=dict)
async def aggregate_documents(
    workspace_id: str,
    collection_id: str,
    query: DocumentAggregateQuery,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    service = CollectionService(db)
    results, total_groups = await service.aggregate_documents(workspace_id, collection_id, query)
    return {
        "success": True,
        "results": results,
        "total_groups": total_groups,
    }


@router.post("/{workspace_id}/collections/{collection_id}/documents", response_model=dict, status_code=201)
async def create_document(
    workspace_id: str,
    collection_id: str,
    data: CollectionDocumentCreate,
    workspace_data: WorkspaceDep,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "write")
    service = CollectionService(db)
    # Path param is authoritative for the target collection.
    data.collection_id = collection_id
    doc = await service.create_document(workspace_id, data, user_id=current_user.id)
    await db.commit()
    await event_bus.publish(
        "collections_changed",
        workspace_id=workspace_id,
        data={"action": "document_create", "collection_id": collection_id, "document_id": doc.id},
    )
    return {"success": True, "document": CollectionDocumentResponse.model_validate(doc)}


@router.get("/{workspace_id}/collections/{collection_id}/documents/{document_id}", response_model=dict)
async def get_document(
    workspace_id: str,
    collection_id: str,
    document_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    service = CollectionService(db)
    doc = await service.get_document(workspace_id, document_id)
    return {"success": True, "document": CollectionDocumentResponse.model_validate(doc)}


@router.patch("/{workspace_id}/collections/{collection_id}/documents/{document_id}", response_model=dict)
async def update_document(
    workspace_id: str,
    collection_id: str,
    document_id: str,
    data: CollectionDocumentUpdate,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "write")
    service = CollectionService(db)
    doc = await service.update_document(workspace_id, document_id, data)
    await db.commit()
    return {"success": True, "document": CollectionDocumentResponse.model_validate(doc)}


@router.delete("/{workspace_id}/collections/{collection_id}/documents/{document_id}", response_model=dict)
async def delete_document(
    workspace_id: str,
    collection_id: str,
    document_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "write")
    service = CollectionService(db)
    await service.delete_document(workspace_id, document_id)
    await db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Quarantine (user, JWT)
# ---------------------------------------------------------------------------

@router.get("/{workspace_id}/quarantine/count", response_model=QuarantineCountResponse)
async def get_quarantine_count(
    workspace_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    service = CollectionService(db)
    count = await service.count_quarantine(workspace_id)
    return QuarantineCountResponse(quarantined=count)


@router.get("/{workspace_id}/quarantine", response_model=dict)
async def list_quarantine(
    workspace_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    service = CollectionService(db)
    docs, total = await service.list_quarantine(workspace_id, limit=limit, offset=offset)
    return {
        "success": True,
        "documents": [CollectionDocumentResponse.model_validate(d) for d in docs],
        "total": total,
    }


@router.post("/{workspace_id}/quarantine/{document_id}/route", response_model=dict)
async def route_quarantined_document(
    workspace_id: str,
    document_id: str,
    data: DocumentRouteRequest,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    _require_collection_admin(member)
    service = CollectionService(db)
    doc = await service.route_document(workspace_id, document_id, data.collection_id)
    await db.commit()
    await event_bus.publish(
        "quarantine_changed",
        workspace_id=workspace_id,
        data={"action": "route", "document_id": document_id, "collection_id": data.collection_id},
    )
    return {"success": True, "document": CollectionDocumentResponse.model_validate(doc)}


@router.delete("/{workspace_id}/quarantine/{document_id}", response_model=dict)
async def discard_quarantined_document(
    workspace_id: str,
    document_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    _require_collection_admin(member)
    service = CollectionService(db)
    await service.delete_document(workspace_id, document_id)
    await db.commit()
    await event_bus.publish(
        "quarantine_changed",
        workspace_id=workspace_id,
        data={"action": "discard", "document_id": document_id},
    )
    return {"success": True}


# ---------------------------------------------------------------------------
# Machine ingestion (MCP / agent — X-Agent-Token or X-API-Key)
# ---------------------------------------------------------------------------

@router.post("/{workspace_id}/collections/{collection_id}/documents:ingest", response_model=dict, status_code=201)
async def ingest_document(
    workspace_id: str,
    collection_id: str,
    data: CollectionDocumentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_api_key: Annotated[str | None, Header()] = None,
    x_agent_token: Annotated[str | None, Header()] = None,
):
    """Ingest a parsed document into a collection (machine auth)."""
    service = CollectionService(db)
    await _authenticate_machine(service, workspace_id, x_api_key, x_agent_token)
    data.collection_id = collection_id
    if not data.source_origin or data.source_origin == "mcp":
        data.source_origin = "inbox" if x_agent_token else "api"
    doc = await service.create_document(workspace_id, data)
    await db.commit()
    await event_bus.publish(
        "collections_changed",
        workspace_id=workspace_id,
        data={"action": "document_create", "collection_id": collection_id, "document_id": doc.id},
    )
    return {"success": True, "document": CollectionDocumentResponse.model_validate(doc)}


@router.post("/{workspace_id}/quarantine:ingest", response_model=dict, status_code=201)
async def ingest_quarantine(
    workspace_id: str,
    data: CollectionDocumentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_api_key: Annotated[str | None, Header()] = None,
    x_agent_token: Annotated[str | None, Header()] = None,
):
    """Park an unclassifiable document in quarantine (machine auth)."""
    service = CollectionService(db)
    await _authenticate_machine(service, workspace_id, x_api_key, x_agent_token)
    data.collection_id = None
    if not data.source_origin or data.source_origin == "mcp":
        data.source_origin = "inbox" if x_agent_token else "api"
    doc = await service.create_document(workspace_id, data)
    await db.commit()
    await event_bus.publish(
        "quarantine_changed",
        workspace_id=workspace_id,
        data={"action": "ingest", "document_id": doc.id},
    )
    return {"success": True, "document": CollectionDocumentResponse.model_validate(doc)}
