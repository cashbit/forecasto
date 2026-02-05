"""User endpoints."""

from __future__ import annotations


from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user
from forecasto.exceptions import NotFoundException
from forecasto.models.user import User
from forecasto.schemas.common import SuccessResponse
from forecasto.schemas.user import UserCreate, UserResponse, UserUpdate
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
