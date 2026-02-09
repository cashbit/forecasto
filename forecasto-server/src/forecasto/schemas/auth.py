"""Authentication schemas."""

from __future__ import annotations


from pydantic import BaseModel, EmailStr

class LoginRequest(BaseModel):
    """Login request body."""

    email: EmailStr
    password: str

class UserInfo(BaseModel):
    """Basic user information."""

    id: str
    email: str
    name: str
    invite_code: str
    is_admin: bool = False
    is_partner: bool = False

class LoginResponse(BaseModel):
    """Login response with tokens."""

    success: bool = True
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserInfo

class RefreshRequest(BaseModel):
    """Token refresh request."""

    refresh_token: str

class TokenResponse(BaseModel):
    """Token refresh response."""

    success: bool = True
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
