"""User schemas."""

from __future__ import annotations


from datetime import datetime

from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    """User registration request."""

    email: EmailStr
    password: str
    name: str

class UserUpdate(BaseModel):
    """User profile update request."""

    name: str | None = None
    notification_preferences: dict | None = None

class UserResponse(BaseModel):
    """User profile response."""

    id: str
    email: str
    name: str
    invite_code: str
    email_verified: bool
    created_at: datetime
    last_login_at: datetime | None = None
    notification_preferences: dict

    model_config = {"from_attributes": True}
