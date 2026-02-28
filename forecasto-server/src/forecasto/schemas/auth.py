"""Authentication schemas."""

from __future__ import annotations


from pydantic import BaseModel, EmailStr, Field

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

class ResetPasswordByCodeRequest(BaseModel):
    """Request to reset password using the original registration code."""

    email: EmailStr
    registration_code: str
    new_password: str = Field(min_length=6)


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
