"""Session schemas."""

from __future__ import annotations


from datetime import datetime
from typing import Any

from pydantic import BaseModel

class SessionCreate(BaseModel):
    """Session creation request."""

    title: str | None = None

class SessionUser(BaseModel):
    """Session user info."""

    id: str
    name: str

    model_config = {"from_attributes": True}

class ChangesSummary(BaseModel):
    """Summary of changes in a session."""

    created: int = 0
    updated: int = 0
    deleted: int = 0
    transferred: int = 0

class SessionResponse(BaseModel):
    """Session response."""

    id: str
    title: str | None
    user: SessionUser | None = None
    status: str
    created_at: datetime
    last_activity: datetime
    committed_at: datetime | None = None
    discarded_at: datetime | None = None
    commit_message: str | None = None
    changes_count: int
    changes_summary: ChangesSummary

    model_config = {"from_attributes": True}

class MessageCreate(BaseModel):
    """Message creation request."""

    content: str

class MessageResponse(BaseModel):
    """Message response."""

    id: str
    sequence: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}

class OperationResponse(BaseModel):
    """Operation response."""

    id: str
    sequence: int
    operation_type: str
    record_id: str
    area: str
    before_snapshot: dict | None = None
    after_snapshot: dict
    from_area: str | None = None
    to_area: str | None = None
    is_undone: bool
    created_at: datetime

    model_config = {"from_attributes": True}

class ConflictInfo(BaseModel):
    """Information about a conflict."""

    record_id: str
    area: str
    your_version: dict
    current_version: dict
    modified_by: SessionUser
    modified_at: datetime

class ConflictResponse(BaseModel):
    """Conflict response during commit."""

    success: bool = False
    error: str = "Conflicts detected"
    error_code: str = "CONFLICT"
    conflicts: list[ConflictInfo]

class ConflictResolution(BaseModel):
    """Resolution for a single conflict."""

    record_id: str
    strategy: str  # keep_mine, keep_theirs, manual
    manual_values: dict[str, Any] | None = None

class ResolveConflictsRequest(BaseModel):
    """Request to resolve conflicts."""

    resolutions: list[ConflictResolution]
    commit_message: str | None = None

class CommitRequest(BaseModel):
    """Session commit request."""

    message: str | None = None

class CommitResponse(BaseModel):
    """Session commit response."""

    success: bool = True
    changes_committed: int
    session: SessionResponse

class DiscardResponse(BaseModel):
    """Session discard response."""

    success: bool = True
    session: SessionResponse
    changes_discarded: int

class UndoResponse(BaseModel):
    """Undo operation response."""

    success: bool = True
    undone_operation: OperationResponse
    message: MessageResponse

class RedoResponse(BaseModel):
    """Redo operation response."""

    success: bool = True
    redone_operation: OperationResponse
    message: MessageResponse
