"""Admin API endpoints for registration codes and user management."""

from __future__ import annotations

import logging
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import require_admin
from forecasto.models.user import User
from forecasto.schemas.admin import (
    ActivatedCodesReportFilter,
    AdminUserListResponse,
    AdminUserResponse,
    AssignPartnerRequest,
    BatchListResponse,
    BatchWithCodesResponse,
    BlockUserRequest,
    CodeFilter,
    CodeListResponse,
    CreateBatchRequest,
    InvoiceCodesRequest,
    RecognizeFeeRequest,
    RegistrationCodeResponse,
    SetPartnerRequest,
    SetPartnerTypeRequest,
    UpdateBatchRequest,
    UpdateCodeRecipientRequest,
    UserFilter,
    ValidateCodeRequest,
    ValidateCodeResponse,
)
from forecasto.models.registration_code import RegistrationCode
from forecasto.services.activecampaign_service import ActiveCampaignService
from forecasto.services.admin_service import AdminService

logger = logging.getLogger(__name__)

router = APIRouter()


# Registration Code Batch Endpoints


@router.post("/registration-codes", response_model=dict, status_code=201)
async def create_registration_codes(
    data: CreateBatchRequest,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate a batch of registration codes."""
    service = AdminService(db)
    batch = await service.create_batch(data, admin_user)
    return {"success": True, "batch": batch}


@router.get("/registration-codes/batches", response_model=dict)
async def list_batches(
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all registration code batches."""
    service = AdminService(db)
    batches = await service.list_batches()
    return {"success": True, "batches": batches}


@router.get("/registration-codes/batches/{batch_id}", response_model=dict)
async def get_batch(
    batch_id: str,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a specific batch with all its codes."""
    service = AdminService(db)
    batch = await service.get_batch(batch_id)
    return {"success": True, "batch": batch}


# Registration Code Endpoints


@router.get("/registration-codes", response_model=dict)
async def list_codes(
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    batch_id: str | None = Query(None),
    status: str | None = Query("all"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List registration codes with filtering."""
    filters = CodeFilter(
        batch_id=batch_id,
        status=status,  # type: ignore
        page=page,
        page_size=page_size,
    )
    service = AdminService(db)
    codes, total = await service.list_codes(filters)
    return {"success": True, "codes": codes, "total": total}


@router.get("/registration-codes/{code_id}", response_model=dict)
async def get_code(
    code_id: str,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a specific registration code."""
    service = AdminService(db)
    code = await service.get_code(code_id)
    return {"success": True, "code": code}


@router.delete("/registration-codes/{code_id}", response_model=dict)
async def revoke_code(
    code_id: str,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Revoke a registration code."""
    service = AdminService(db)
    code = await service.revoke_code(code_id)
    return {"success": True, "code": code}


@router.patch("/registration-codes/{code_id}/recipient", response_model=dict)
async def update_code_recipient(
    code_id: str,
    data: UpdateCodeRecipientRequest,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update recipient name and email for a registration code."""
    service = AdminService(db)
    code = await service.update_code_recipient(code_id, data.recipient_name, data.recipient_email)
    return {"success": True, "code": code}


@router.post("/registration-codes/validate", response_model=dict)
async def validate_code(
    data: ValidateCodeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Validate a registration code (public endpoint for registration form)."""
    service = AdminService(db)
    try:
        code = await service.validate_registration_code(data.code)
        return {
            "success": True,
            "validation": ValidateCodeResponse(
                valid=True,
                code=code.code,
                expires_at=code.expires_at,
            ),
        }
    except Exception as e:
        return {
            "success": True,
            "validation": ValidateCodeResponse(
                valid=False,
                error=str(e),
            ),
        }


# User Management Endpoints


@router.get("/users", response_model=dict)
async def list_users(
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    search: str | None = Query(None),
    status: str | None = Query("all"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List users with filtering."""
    filters = UserFilter(
        search=search,
        status=status,  # type: ignore
        page=page,
        page_size=page_size,
    )
    service = AdminService(db)
    users, total = await service.list_users(filters)
    return {"success": True, "users": users, "total": total}


@router.get("/users/{user_id}", response_model=dict)
async def get_user(
    user_id: str,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a specific user."""
    service = AdminService(db)
    user = await service.get_user(user_id)
    return {"success": True, "user": user}


@router.patch("/users/{user_id}/block", response_model=dict)
async def block_user(
    user_id: str,
    data: BlockUserRequest,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Block a user."""
    service = AdminService(db)
    user = await service.block_user(user_id, data.reason, admin_user)
    return {"success": True, "user": user}


@router.patch("/users/{user_id}/unblock", response_model=dict)
async def unblock_user(
    user_id: str,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Unblock a user."""
    service = AdminService(db)
    user = await service.unblock_user(user_id)
    return {"success": True, "user": user}


@router.patch("/users/{user_id}/partner", response_model=dict)
async def set_partner(
    user_id: str,
    data: SetPartnerRequest,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Set or unset partner role for a user."""
    service = AdminService(db)
    user = await service.set_partner(user_id, data.is_partner, admin_user)
    return {"success": True, "user": user}


@router.patch("/registration-codes/batches/{batch_id}", response_model=dict)
async def update_batch(
    batch_id: str,
    data: UpdateBatchRequest,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Rename a batch."""
    service = AdminService(db)
    batch = await service.update_batch(batch_id, data.name)
    return {"success": True, "batch": batch}


@router.delete("/registration-codes/batches/{batch_id}", response_model=dict)
async def delete_batch(
    batch_id: str,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a batch and all its codes."""
    service = AdminService(db)
    await service.delete_batch(batch_id)
    return {"success": True}


@router.patch("/registration-codes/batches/{batch_id}/assign-partner", response_model=dict)
async def assign_batch_to_partner(
    batch_id: str,
    data: AssignPartnerRequest,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Assign a batch to a partner."""
    service = AdminService(db)
    batch = await service.assign_batch_to_partner(batch_id, data.partner_id)
    return {"success": True, "batch": batch}


# Partner Type Endpoint


@router.patch("/users/{user_id}/partner-type", response_model=dict)
async def set_partner_type(
    user_id: str,
    data: SetPartnerTypeRequest,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Set the billing type for a partner."""
    service = AdminService(db)
    user = await service.set_partner_type(user_id, data.partner_type)
    return {"success": True, "user": user}


# Report and Billing Endpoints


@router.get("/reports/activated-codes", response_model=dict)
async def get_activated_codes_report(
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    partner_id: str | None = Query(None),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None),
    invoiced: bool | None = Query(None),
):
    """Get report of activated codes."""
    filters = ActivatedCodesReportFilter(
        partner_id=partner_id,
        month=month,
        year=year,
        invoiced=invoiced,
    )
    service = AdminService(db)
    rows = await service.get_activated_codes_report(filters)
    return {"success": True, "rows": rows}


@router.post("/reports/activated-codes/invoice", response_model=dict)
async def invoice_codes(
    data: InvoiceCodesRequest,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark codes as invoiced."""
    service = AdminService(db)
    count = await service.invoice_codes(data.code_ids, data.invoiced_to, data.invoice_note)
    return {"success": True, "updated": count}


@router.post("/reports/activated-codes/recognize-fee", response_model=dict)
async def recognize_partner_fee(
    data: RecognizeFeeRequest,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Recognize partner fee for codes invoiced to client."""
    service = AdminService(db)
    count = await service.recognize_partner_fee(data.code_ids)
    return {"success": True, "updated": count}


@router.get("/reports/billing-summary", response_model=dict)
async def get_billing_summary(
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    partner_id: str | None = Query(None),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None),
):
    """Get billing summary per partner."""
    service = AdminService(db)
    summaries = await service.get_billing_summary(partner_id, month, year)
    return {"success": True, "summaries": summaries}


@router.get("/reports/activated-codes/export")
async def export_activated_codes_csv(
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    partner_id: str | None = Query(None),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None),
    invoiced: bool | None = Query(None),
):
    """Export activated codes as CSV."""
    filters = ActivatedCodesReportFilter(
        partner_id=partner_id,
        month=month,
        year=year,
        invoiced=invoiced,
    )
    service = AdminService(db)
    csv_content = await service.export_activated_codes_csv(filters)

    import io

    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=report_attivazioni.csv"},
    )


# ActiveCampaign Integration


@router.post("/activecampaign/sync-code/{code_id}", response_model=dict)
async def sync_activecampaign_contact(
    code_id: str,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Sync a registration code's recipient to ActiveCampaign."""
    from sqlalchemy import select

    result = await db.execute(
        select(RegistrationCode).where(RegistrationCode.id == code_id)
    )
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(status_code=404, detail="Codice non trovato")
    if not code.recipient_email:
        raise HTTPException(status_code=400, detail="Codice senza email destinatario")

    # Build registration URL
    params: dict[str, str] = {"code": code.code}
    if code.recipient_email:
        params["email"] = code.recipient_email
    if code.recipient_name:
        params["name"] = code.recipient_name
    invite_url = f"https://app.forecasto.it/register?{urlencode(params)}"

    # Split name into first/last
    first_name = None
    last_name = None
    if code.recipient_name:
        parts = code.recipient_name.strip().split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else None

    ac_service = ActiveCampaignService()
    try:
        ac_response = await ac_service.sync_contact(
            email=code.recipient_email,
            first_name=first_name,
            last_name=last_name,
            invite_url=invite_url,
        )
        contact_data = ac_response.get("contact", {})

        # Update ac_synced_at timestamp
        from datetime import datetime
        code.ac_synced_at = datetime.utcnow()
        await db.commit()

        return {
            "success": True,
            "contact_id": contact_data.get("id"),
        }
    except Exception as e:
        logger.error(f"ActiveCampaign sync failed for {code.recipient_email}: {e}")
        raise HTTPException(status_code=502, detail=f"Errore ActiveCampaign: {e}")


# --- LLM Pricing Management ---

@router.get("/llm-pricing", response_model=dict)
async def list_llm_pricing(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all LLM pricing configs (admin only)."""
    from forecasto.services.document_processing_service import DocumentProcessingService
    from forecasto.schemas.document_processing import LLMPricingResponse
    configs = await DocumentProcessingService.list_pricing(db)
    return {
        "success": True,
        "configs": [LLMPricingResponse.model_validate(c) for c in configs],
    }


@router.put("/llm-pricing/{config_id}", response_model=dict)
async def update_llm_pricing(
    config_id: str,
    body: dict,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a LLM pricing config (admin only)."""
    from forecasto.services.document_processing_service import DocumentProcessingService
    from forecasto.schemas.document_processing import LLMPricingResponse, LLMPricingUpdate
    update_data = LLMPricingUpdate(**body)
    config = await DocumentProcessingService.update_pricing(
        db, config_id, **update_data.model_dump(exclude_none=True)
    )
    if not config:
        from forecasto.exceptions import NotFoundException
        raise NotFoundException("Pricing config non trovato")
    await db.commit()
    return {"success": True, "config": LLMPricingResponse.model_validate(config)}
