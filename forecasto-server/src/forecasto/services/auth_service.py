"""Authentication service."""

from __future__ import annotations


from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.config import settings
from forecasto.exceptions import UnauthorizedException, ValidationException
from forecasto.models.user import RefreshToken, User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.auth import LoginResponse, TokenResponse, UserInfo
from forecasto.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

class AuthService:
    """Service for authentication operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def login(self, email: str, password: str) -> LoginResponse:
        """Authenticate user and return tokens."""
        result = await self.db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if not user or not verify_password(password, user.password_hash):
            raise UnauthorizedException("Invalid email or password")

        access_token = create_access_token({"sub": user.id, "email": user.email})
        refresh_token = create_refresh_token({"sub": user.id})

        # Store refresh token
        refresh_token_obj = RefreshToken(
            user_id=user.id,
            token_hash=hash_password(refresh_token),
            expires_at=datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days),
        )
        self.db.add(refresh_token_obj)

        # Update last login
        user.last_login_at = datetime.utcnow()

        return LoginResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.access_token_expire_minutes * 60,
            user=UserInfo(id=user.id, email=user.email, name=user.name, invite_code=user.invite_code),
        )

    async def refresh_token(self, refresh_token: str) -> TokenResponse:
        """Refresh access token using refresh token."""
        try:
            payload = decode_token(refresh_token)
        except ValueError:
            raise UnauthorizedException("Invalid refresh token")

        if payload.get("type") != "refresh":
            raise UnauthorizedException("Invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            raise UnauthorizedException("Invalid token payload")

        # Get user
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise UnauthorizedException("User not found")

        # Verify refresh token exists and is not revoked
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > datetime.utcnow(),
            )
        )
        stored_tokens = result.scalars().all()

        valid_token = None
        for token in stored_tokens:
            if verify_password(refresh_token, token.token_hash):
                valid_token = token
                break

        if not valid_token:
            raise UnauthorizedException("Refresh token not found or revoked")

        # Revoke old token
        valid_token.revoked_at = datetime.utcnow()

        # Create new tokens
        new_access_token = create_access_token({"sub": user.id, "email": user.email})
        new_refresh_token = create_refresh_token({"sub": user.id})

        # Store new refresh token
        new_refresh_token_obj = RefreshToken(
            user_id=user.id,
            token_hash=hash_password(new_refresh_token),
            expires_at=datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days),
        )
        self.db.add(new_refresh_token_obj)

        return TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            expires_in=settings.access_token_expire_minutes * 60,
        )

    async def logout(self, refresh_token: str) -> None:
        """Revoke refresh token."""
        try:
            payload = decode_token(refresh_token)
        except ValueError:
            return

        user_id = payload.get("sub")
        if not user_id:
            return

        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
            )
        )
        tokens = result.scalars().all()

        for token in tokens:
            if verify_password(refresh_token, token.token_hash):
                token.revoked_at = datetime.utcnow()
                break

    async def register(self, email: str, password: str, name: str) -> User:
        """Register a new user."""
        # Check if email exists
        result = await self.db.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none():
            raise ValidationException("Email already registered")

        user = User(
            email=email,
            password_hash=hash_password(password),
            name=name,
        )
        self.db.add(user)
        await self.db.flush()

        # Create default workspace for the user
        current_year = datetime.utcnow().year
        workspace = Workspace(
            name=f"Workspace di {name}",
            fiscal_year=current_year,
            owner_id=user.id,
            email_whitelist=[],
            settings={},
        )
        self.db.add(workspace)
        await self.db.flush()

        # Add user as owner of the workspace
        member = WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role="owner",
            area_permissions={
                "actual": "write",
                "orders": "write",
                "prospect": "write",
                "budget": "write",
            },
        )
        self.db.add(member)

        return user
