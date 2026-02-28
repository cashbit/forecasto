"""Authentication endpoints."""

from __future__ import annotations


from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.schemas.auth import LoginRequest, LoginResponse, RefreshRequest, ResetPasswordByCodeRequest, TokenResponse
from forecasto.schemas.common import SuccessResponse
from forecasto.services.auth_service import AuthService

router = APIRouter()

@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Authenticate user and return tokens."""

    service = AuthService(db)
    return await service.login(data.email, data.password)

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    data: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Refresh access token."""
    service = AuthService(db)
    return await service.refresh_token(data.refresh_token)

@router.post("/logout", response_model=SuccessResponse)
async def logout(
    data: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Revoke refresh token."""
    service = AuthService(db)
    await service.logout(data.refresh_token)
    return SuccessResponse()

@router.post("/reset-password/by-code", response_model=SuccessResponse)
async def reset_password_by_code(
    data: ResetPasswordByCodeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Reset password using the original registration code."""
    service = AuthService(db)
    await service.reset_password_by_code(data.email, data.registration_code, data.new_password)
    return SuccessResponse()
