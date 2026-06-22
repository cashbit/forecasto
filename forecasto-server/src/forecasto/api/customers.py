"""Customer (anagrafiche cliente) endpoints + VIES lookup.

Customers are stored in the per-workspace ``customers`` collection, so access is
governed by the same collection permissions used elsewhere.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import (
    check_collection_permission,
    get_current_user,
    get_current_workspace,
)
from forecasto.models.collection import CollectionDocument
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.customer import (
    CustomerResponse,
    CustomerUpsert,
    ViesLookupRequest,
    ViesLookupResponse,
)
from forecasto.services.customer_service import CustomerService
from forecasto.services.event_bus import event_bus
from forecasto.services.vies_service import ViesService

router = APIRouter()

WorkspaceDep = Annotated[tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)]


def _to_response(doc: CollectionDocument) -> CustomerResponse:
    return CustomerResponse(
        document_id=doc.id,
        data=doc.data or {},
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.post("/{workspace_id}/customers/vies-lookup", response_model=ViesLookupResponse)
async def vies_lookup(
    workspace_id: str,
    data: ViesLookupRequest,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    return await ViesService().lookup(data.country_code, data.vat_number)


@router.post("/{workspace_id}/customers", response_model=dict, status_code=201)
async def upsert_customer(
    workspace_id: str,
    data: CustomerUpsert,
    workspace_data: WorkspaceDep,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "write")
    service = CustomerService(db)
    doc = await service.upsert_customer(workspace_id, data, user_id=current_user.id)
    await db.commit()
    await event_bus.publish(
        "collections_changed",
        workspace_id=workspace_id,
        data={"action": "customer_upsert", "document_id": doc.id},
    )
    return {"success": True, "customer": _to_response(doc)}


@router.get("/{workspace_id}/customers", response_model=dict)
async def list_customers(
    workspace_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
    search: str | None = Query(None),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    service = CustomerService(db)
    docs, total = await service.list_customers(workspace_id, search=search, limit=limit, offset=offset)
    return {"success": True, "customers": [_to_response(d) for d in docs], "total": total}


@router.get("/{workspace_id}/customers/{document_id}", response_model=dict)
async def get_customer(
    workspace_id: str,
    document_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    service = CustomerService(db)
    doc = await service.get_customer(workspace_id, document_id)
    return {"success": True, "customer": _to_response(doc)}
