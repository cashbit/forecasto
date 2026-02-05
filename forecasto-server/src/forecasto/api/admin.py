"""Admin API endpoints for registration codes and user management."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import require_admin
from forecasto.models.user import User
from forecasto.schemas.admin import (
    AdminUserListResponse,
    AdminUserResponse,
    BatchListResponse,
    BatchWithCodesResponse,
    BlockUserRequest,
    CodeFilter,
    CodeListResponse,
    CreateBatchRequest,
    RegistrationCodeResponse,
    UserFilter,
    ValidateCodeRequest,
    ValidateCodeResponse,
)
from forecasto.services.admin_service import AdminService

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
