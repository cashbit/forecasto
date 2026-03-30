"""User endpoints."""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user
from forecasto.exceptions import NotFoundException
from forecasto.models.user import User
from forecasto.schemas.common import SuccessResponse
from forecasto.schemas.user import (
    DeleteAccountPrecheck,
    DeleteAccountRequest,
    PasswordChange,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from forecasto.services.auth_service import AuthService
from forecasto.services.user_service import UserService

router = APIRouter()

@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    data: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Register a new user with a registration code."""

    service = AuthService(db)
    user = await service.register(
        data.email, data.password, data.name, data.registration_code
    )
    return UserResponse.model_validate(user)

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Get current user profile."""
    return UserResponse.model_validate(current_user)

@router.patch("/me", response_model=UserResponse)
async def update_profile(
    data: UserUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update current user profile."""
    service = UserService(db)
    user = await service.update_user(current_user, data)
    return UserResponse.model_validate(user)


@router.post("/me/password", response_model=SuccessResponse)
async def change_password(
    data: PasswordChange,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Change current user password."""
    service = UserService(db)
    await service.change_password(current_user, data.current_password, data.new_password)
    return SuccessResponse(success=True)


@router.get("/lookup/{invite_code}", response_model=dict)
async def lookup_user_by_code(
    invite_code: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Lookup user by invite code - returns only name for privacy."""
    # Normalize code: uppercase, remove dashes and spaces
    cleaned = invite_code.upper().replace('-', '').replace(' ', '')
    if len(cleaned) != 9:
        raise NotFoundException("Codice non valido")

    normalized = f"{cleaned[:3]}-{cleaned[3:6]}-{cleaned[6:9]}"

    result = await db.execute(
        select(User).where(User.invite_code == normalized)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise NotFoundException(f"Nessun utente trovato con codice {normalized}")

    return {
        "success": True,
        "user": {
            "name": user.name,
            "invite_code": user.invite_code,
        }
    }


@router.post("/me/verify-password", response_model=SuccessResponse)
async def verify_password(
    data: PasswordChange,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Verify the user's current password (used before sensitive operations)."""
    from forecasto.utils.security import verify_password as check_password
    from forecasto.exceptions import ValidationException
    if not check_password(data.current_password, current_user.password_hash):
        raise ValidationException("Password non corretta")
    return SuccessResponse(success=True)


@router.get("/me/deletion-precheck", response_model=DeleteAccountPrecheck)
async def deletion_precheck(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Check if the user can delete their account (GDPR Art. 17)."""
    service = UserService(db)
    return await service.precheck_deletion(current_user)


@router.post("/me/export-data")
async def export_data(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Export all user data as JSON (GDPR Art. 20 data portability)."""
    service = UserService(db)
    data = await service.export_user_data(current_user)
    content = json.dumps(data, ensure_ascii=False, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="forecasto-export-{current_user.id[:8]}.json"'
        },
    )


@router.delete("/me", response_model=SuccessResponse)
async def delete_account(
    data: DeleteAccountRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete (anonymize) user account (GDPR Art. 17 right to erasure)."""
    service = UserService(db)
    await service.delete_account(current_user, data.password)
    return SuccessResponse(success=True)
