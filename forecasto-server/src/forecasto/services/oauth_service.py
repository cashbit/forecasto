"""OAuth 2.0 service for MCP server authentication."""

from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import UnauthorizedException, ValidationException
from forecasto.models.oauth import OAuthAuthorizationCode, OAuthClient
from forecasto.models.user import User
from forecasto.schemas.auth import TokenResponse, UserInfo
from forecasto.schemas.oauth import TokenResponse as OAuthTokenResponse
from forecasto.services.auth_service import AuthService
from forecasto.utils.security import hash_password, verify_password

# Authorization codes expire in 5 minutes
AUTH_CODE_TTL_SECONDS = 300


class OAuthService:
    """Service for OAuth 2.0 Authorization Code Flow (PKCE)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_client(self, client_id: str) -> OAuthClient:
        """Fetch an OAuth client by client_id. Raises if not found."""
        result = await self.db.execute(
            select(OAuthClient).where(OAuthClient.client_id == client_id)
        )
        client = result.scalar_one_or_none()
        if not client:
            raise ValidationException(f"Unknown OAuth client: {client_id}")
        return client

    async def validate_client_redirect(self, client_id: str, redirect_uri: str) -> OAuthClient:
        """Validate that client exists and redirect_uri is registered."""
        client = await self.get_client(client_id)
        if redirect_uri not in client.redirect_uris:
            raise ValidationException(
                f"redirect_uri not registered for client {client_id}"
            )
        return client

    async def create_authorization_code(
        self,
        user_id: str,
        client_id: str,
        redirect_uri: str,
        scope: str,
        code_challenge: str | None,
        code_challenge_method: str | None,
    ) -> str:
        """Create a one-time authorization code. Returns the plaintext code."""
        plaintext_code = secrets.token_urlsafe(32)
        code_hash = hash_password(plaintext_code)

        auth_code = OAuthAuthorizationCode(
            client_id=client_id,
            user_id=user_id,
            code_hash=code_hash,
            redirect_uri=redirect_uri,
            scope=scope,
            code_challenge=code_challenge,
            code_challenge_method=code_challenge_method,
            expires_at=datetime.utcnow() + timedelta(seconds=AUTH_CODE_TTL_SECONDS),
        )
        self.db.add(auth_code)
        await self.db.flush()

        return plaintext_code

    async def exchange_code_for_tokens(
        self,
        code: str,
        client_id: str,
        redirect_uri: str,
        code_verifier: str | None,
    ) -> OAuthTokenResponse:
        """Exchange authorization code for access + refresh tokens (PKCE)."""
        # Find non-expired, unused codes for this client
        result = await self.db.execute(
            select(OAuthAuthorizationCode).where(
                OAuthAuthorizationCode.client_id == client_id,
                OAuthAuthorizationCode.used_at.is_(None),
                OAuthAuthorizationCode.expires_at > datetime.utcnow(),
            )
        )
        candidates = result.scalars().all()

        matching_code: OAuthAuthorizationCode | None = None
        for candidate in candidates:
            if verify_password(code, candidate.code_hash):
                matching_code = candidate
                break

        if not matching_code:
            raise UnauthorizedException("Invalid or expired authorization code")

        if matching_code.redirect_uri != redirect_uri:
            raise UnauthorizedException("redirect_uri mismatch")

        # PKCE validation
        if matching_code.code_challenge:
            if not code_verifier:
                raise UnauthorizedException("code_verifier required for PKCE")
            if matching_code.code_challenge_method == "S256":
                digest = hashlib.sha256(code_verifier.encode()).digest()
                computed_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
                if computed_challenge != matching_code.code_challenge:
                    raise UnauthorizedException("PKCE code_verifier does not match code_challenge")

        # Mark code as used
        matching_code.used_at = datetime.utcnow()

        # Issue tokens via AuthService
        from forecasto.config import settings
        from forecasto.utils.security import create_access_token, create_refresh_token
        from forecasto.models.user import RefreshToken

        result = await self.db.execute(select(User).where(User.id == matching_code.user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise UnauthorizedException("User not found")

        access_token = create_access_token({"sub": user.id, "email": user.email})
        refresh_token = create_refresh_token({"sub": user.id})

        refresh_token_obj = RefreshToken(
            user_id=user.id,
            token_hash=hash_password(refresh_token),
            expires_at=datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days),
        )
        self.db.add(refresh_token_obj)

        return OAuthTokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.access_token_expire_minutes * 60,
            scope=matching_code.scope,
        )

    async def authenticate_user(self, email: str, password: str) -> User:
        """Authenticate user with email/password. Returns user or raises."""
        result = await self.db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user or not verify_password(password, user.password_hash):
            raise UnauthorizedException("Email o password non validi")
        if user.is_blocked:
            raise UnauthorizedException("Account bloccato. Contatta l'amministratore.")
        return user
