"""FastAPI dependencies for authentication and authorization."""

from __future__ import annotations


from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.exceptions import (
    AreaPermissionDeniedException,
    ForbiddenException,
    NotFoundException,
    SessionNotActiveException,
    SessionRequiredException,
    UnauthorizedException,
)
from forecasto.models.session import Session
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.utils.security import decode_token

async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Get the current authenticated user from JWT token."""

    if not authorization:
        raise UnauthorizedException("Authorization header required")

    if not authorization.startswith("Bearer "):
        raise UnauthorizedException("Invalid authorization header format")

    token = authorization[7:]

    try:
        payload = decode_token(token)
    except ValueError as e:
        raise UnauthorizedException(str(e))

    if payload.get("type") != "access":
        raise UnauthorizedException("Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedException("Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise UnauthorizedException("User not found")

    if user.is_blocked:
        raise UnauthorizedException("Account bloccato. Contatta l'amministratore.")

    return user

async def get_current_workspace(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> tuple[Workspace, WorkspaceMember]:
    """Get workspace and verify user has access."""
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise NotFoundException(f"Workspace {workspace_id} not found")

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id,
        )
    )
    member = result.scalar_one_or_none()

    if not member:
        raise ForbiddenException("You are not a member of this workspace")

    return workspace, member

async def get_active_session(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    x_session_id: Annotated[str | None, Header()] = None,
) -> Session | None:
    """Get active session from X-Session-Id header."""
    if not x_session_id:
        return None

    result = await db.execute(
        select(Session).where(
            Session.id == x_session_id,
            Session.workspace_id == workspace_id,
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise NotFoundException(f"Session {x_session_id} not found")

    if session.status != "active":
        raise SessionNotActiveException()

    if session.user_id != current_user.id:
        raise ForbiddenException("This session belongs to another user")

    return session

async def require_active_session(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    x_session_id: Annotated[str | None, Header()] = None,
) -> Session:
    """Require an active session from X-Session-Id header."""
    if not x_session_id:
        raise SessionRequiredException()

    session = await get_active_session(workspace_id, db, current_user, x_session_id)
    if not session:
        raise SessionRequiredException()

    return session

def check_area_permission(member: WorkspaceMember, area: str, required: str = "read") -> None:
    """Check if member has required permission for area."""
    permission = member.area_permissions.get(area, "none")

    if required == "write" and permission != "write":
        raise AreaPermissionDeniedException(area, "write")

    if required == "read" and permission == "none":
        raise AreaPermissionDeniedException(area, "read")


async def require_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Require the current user to be an admin."""
    if not current_user.is_admin:
        raise ForbiddenException("Accesso riservato agli amministratori")
    return current_user
