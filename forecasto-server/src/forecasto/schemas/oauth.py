"""OAuth 2.0 schemas for MCP server authentication."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class AuthorizeParams(BaseModel):
    """Query parameters for GET /oauth/authorize."""

    client_id: str
    redirect_uri: str
    response_type: str = "code"
    scope: str = "read write"
    state: str = ""
    code_challenge: Optional[str] = None
    code_challenge_method: Optional[str] = None


class TokenRequest(BaseModel):
    """Request body for POST /oauth/token."""

    grant_type: str  # "authorization_code" or "refresh_token"
    code: Optional[str] = None
    redirect_uri: Optional[str] = None
    client_id: Optional[str] = None
    code_verifier: Optional[str] = None
    refresh_token: Optional[str] = None


class TokenResponse(BaseModel):
    """Response for POST /oauth/token."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    scope: str = "read write"


class OAuthMetadata(BaseModel):
    """OAuth Authorization Server Metadata (RFC 8414 / .well-known)."""

    issuer: str
    authorization_endpoint: str
    token_endpoint: str
    response_types_supported: list[str] = ["code"]
    grant_types_supported: list[str] = ["authorization_code", "refresh_token"]
    code_challenge_methods_supported: list[str] = ["S256"]
    scopes_supported: list[str] = ["read", "write"]
    token_endpoint_auth_methods_supported: list[str] = ["none"]
