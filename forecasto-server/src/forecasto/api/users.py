"""User endpoints."""

from __future__ import annotations


from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user
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
    """Register a new user."""

    service = AuthService(db)
    user = await service.register(data.email, data.password, data.name)
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
