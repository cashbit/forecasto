"""Invoice (fatture attive) endpoints.

Invoices live in the per-workspace ``invoices`` collection, so access uses the
same collection permissions as the rest of the document store. Phase 2 exposes
draft create/update/get/list; issuance, XML and lifecycle land in later phases.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
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
from forecasto.schemas.invoice import (
    InvoiceDraftCreate,
    InvoiceResponse,
    InvoiceUpdate,
    PaymentTermsParseRequest,
    SdiSubmissionRequest,
)
from forecasto.services.einvoice_service import EInvoiceService
from forecasto.services.event_bus import event_bus
from forecasto.services.invoice_service import InvoiceService
from forecasto.services.payment_terms import parse_payment_terms

router = APIRouter()

WorkspaceDep = Annotated[tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)]


def _to_response(doc: CollectionDocument) -> InvoiceResponse:
    data = doc.data or {}
    return InvoiceResponse(
        document_id=doc.id,
        status=(data.get("lifecycle") or {}).get("status", "draft"),
        number=data.get("number"),
        data=data,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.post("/{workspace_id}/invoices/draft", response_model=dict, status_code=201)
async def create_invoice_draft(
    workspace_id: str,
    data: InvoiceDraftCreate,
    workspace_data: WorkspaceDep,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "write")
    service = InvoiceService(db)
    doc = await service.create_draft(workspace_id, data, user_id=current_user.id)
    await db.commit()
    await event_bus.publish(
        "invoice.changed",
        workspace_id=workspace_id,
        data={"action": "draft_create", "document_id": doc.id},
    )
    return {"success": True, "invoice": _to_response(doc)}


@router.post("/{workspace_id}/invoices/parse-payment-terms", response_model=dict)
async def parse_terms(
    workspace_id: str,
    data: PaymentTermsParseRequest,
    workspace_data: WorkspaceDep,
):
    """Preview the due dates a payment-terms string yields (no persistence)."""
    _, member = workspace_data
    check_collection_permission(member, "read")
    return {"success": True, "scadenze": parse_payment_terms(data.text, data.issue_date)}


@router.get("/{workspace_id}/invoices", response_model=dict)
async def list_invoices(
    workspace_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    service = InvoiceService(db)
    docs, total = await service.list_invoices(workspace_id, limit=limit, offset=offset)
    return {"success": True, "invoices": [_to_response(d) for d in docs], "total": total}


@router.get("/{workspace_id}/invoices/{document_id}", response_model=dict)
async def get_invoice(
    workspace_id: str,
    document_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    service = InvoiceService(db)
    doc = await service.get_invoice(workspace_id, document_id)
    return {"success": True, "invoice": _to_response(doc)}


@router.post("/{workspace_id}/invoices/{document_id}/issue", response_model=dict)
async def issue_invoice(
    workspace_id: str,
    document_id: str,
    workspace_data: WorkspaceDep,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "write")
    service = InvoiceService(db)
    doc = await service.issue(workspace_id, document_id, current_user, member=member)
    await db.commit()
    await event_bus.publish(
        "invoice.changed",
        workspace_id=workspace_id,
        data={"action": "issued", "document_id": document_id},
    )
    return {"success": True, "invoice": _to_response(doc)}


@router.post("/{workspace_id}/invoices/{document_id}/sent-to-client", response_model=dict)
async def mark_sent_to_client(
    workspace_id: str,
    document_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "write")
    service = InvoiceService(db)
    doc = await service.mark_sent_to_client(workspace_id, document_id)
    await db.commit()
    await event_bus.publish("invoice.changed", workspace_id=workspace_id,
                            data={"action": "sent_to_client", "document_id": document_id})
    return {"success": True, "invoice": _to_response(doc)}


@router.post("/{workspace_id}/invoices/{document_id}/sdi-submission", response_model=dict)
async def record_sdi_submission(
    workspace_id: str,
    document_id: str,
    data: SdiSubmissionRequest,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "write")
    service = InvoiceService(db)
    doc = await service.record_sdi_submission(workspace_id, document_id, data.outcome)
    await db.commit()
    await event_bus.publish("invoice.changed", workspace_id=workspace_id,
                            data={"action": "sdi_submitted", "document_id": document_id})
    return {"success": True, "invoice": _to_response(doc)}


@router.get("/{workspace_id}/invoices/{document_id}/einvoices", response_model=dict)
async def list_einvoices(
    workspace_id: str,
    document_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    docs = await EInvoiceService(db).list_for_invoice(workspace_id, document_id)
    return {
        "success": True,
        "einvoices": [
            {
                "document_id": d.id,
                "standard": (d.data or {}).get("standard"),
                "filename": (d.data or {}).get("filename"),
                "generated_at": (d.data or {}).get("generated_at"),
                "validation": (d.data or {}).get("validation"),
                "transmission": (d.data or {}).get("transmission"),
                "stale": (d.data or {}).get("stale", False),
            }
            for d in docs
        ],
    }


@router.get("/{workspace_id}/einvoices/{einvoice_id}/xml")
async def download_einvoice_xml(
    workspace_id: str,
    einvoice_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "read")
    doc = await EInvoiceService(db).get_einvoice(workspace_id, einvoice_id)
    data = doc.data or {}
    xml = data.get("xml") or ""
    filename = data.get("filename") or "einvoice.xml"
    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/{workspace_id}/invoices/{document_id}", response_model=dict)
async def update_invoice(
    workspace_id: str,
    document_id: str,
    data: InvoiceUpdate,
    workspace_data: WorkspaceDep,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_collection_permission(member, "write")
    service = InvoiceService(db)
    doc = await service.update_draft(workspace_id, document_id, data, user_id=current_user.id)
    await db.commit()
    await event_bus.publish(
        "invoice.changed",
        workspace_id=workspace_id,
        data={"action": "update", "document_id": document_id},
    )
    return {"success": True, "invoice": _to_response(doc)}
