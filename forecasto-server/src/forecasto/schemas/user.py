"""User schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


class UserCreate(BaseModel):
    """User registration request."""

    email: EmailStr
    password: str
    name: str
    registration_code: str

    @field_validator("registration_code")
    @classmethod
    def normalize_registration_code(cls, v: str) -> str:
        """Normalize code format: uppercase, add dashes if missing."""
        cleaned = v.upper().replace("-", "").replace(" ", "")
        if len(cleaned) != 12:
            raise ValueError("Il codice deve essere di 12 caratteri")
        if not cleaned.isalnum():
            raise ValueError("Il codice deve contenere solo lettere e numeri")
        return f"{cleaned[:4]}-{cleaned[4:8]}-{cleaned[8:12]}"

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
    is_admin: bool = False
    is_partner: bool = False
    created_at: datetime
    last_login_at: datetime | None = None
    notification_preferences: dict

    model_config = {"from_attributes": True}
