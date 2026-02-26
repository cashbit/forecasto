"""User service."""

from __future__ import annotations


from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import NotFoundException, UnauthorizedException
from forecasto.models.user import User
from forecasto.schemas.user import UserUpdate
from forecasto.utils.security import hash_password, verify_password

class UserService:
    """Service for user operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_user(self, user_id: str) -> User:
        """Get user by ID."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException(f"User {user_id} not found")
        return user

    async def update_user(self, user: User, data: UserUpdate) -> User:
        """Update user profile."""
        if data.name is not None:
            user.name = data.name
        if data.notification_preferences is not None:
            user.notification_preferences = data.notification_preferences

        return user

    async def change_password(self, user: User, current_password: str, new_password: str) -> User:
        """Change user password after verifying the current one."""
        if not verify_password(current_password, user.password_hash):
            raise UnauthorizedException("Password attuale non corretta")
        user.password_hash = hash_password(new_password)
        return user

    async def verify_email(self, user: User) -> User:
        """Mark user email as verified."""
        user.email_verified = True
        return user
