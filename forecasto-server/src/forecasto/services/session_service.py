"""Session service - manages chat-like work sessions."""

from __future__ import annotations


from datetime import datetime
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from forecasto.exceptions import (
    ConflictException,
    NotFoundException,
    SessionNotActiveException,
    ValidationException,
)
from forecasto.models.record import Record
from forecasto.models.session import Session, SessionMessage, SessionOperation, SessionRecordLock
from forecasto.models.user import User
from forecasto.schemas.session import (
    CommitResponse,
    ConflictInfo,
    ConflictResolution,
    DiscardResponse,
    MessageResponse,
    OperationResponse,
    RedoResponse,
    SessionResponse,
    SessionUser,
    UndoResponse,
)

class SessionService:
    """Service for session management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_session(
        self, workspace_id: str, user: User, title: str | None = None
    ) -> Session:
        """Create a new work session."""
        session = Session(
            workspace_id=workspace_id,
            user_id=user.id,
            title=title,
            status="active",
        )
        self.db.add(session)
        await self.db.flush()

        # Add system message
        message = SessionMessage(
            session_id=session.id,
            sequence=1,
            role="system",
            content=f"Session '{title or 'Untitled'}' created",
        )
        self.db.add(message)

        return session

    async def get_session(self, session_id: str) -> Session:
        """Get session by ID."""
        result = await self.db.execute(
            select(Session)
            .options(selectinload(Session.user))
            .where(Session.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise NotFoundException(f"Session {session_id} not found")
        return session

    async def list_sessions(
        self, workspace_id: str, status: str | None = None, user_id: str | None = None
    ) -> list[Session]:
        """List sessions for a workspace."""
        query = select(Session).options(selectinload(Session.user)).where(
            Session.workspace_id == workspace_id
        )

        if status and status != "all":
            query = query.where(Session.status == status)
        if user_id:
            query = query.where(Session.user_id == user_id)

        query = query.order_by(Session.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_messages(self, session_id: str) -> list[SessionMessage]:
        """Get all messages for a session."""
        result = await self.db.execute(
            select(SessionMessage)
            .where(SessionMessage.session_id == session_id)
            .order_by(SessionMessage.sequence)
        )
        return list(result.scalars().all())

    async def add_message(self, session: Session, content: str, role: str = "user") -> SessionMessage:
        """Add a message to the session."""
        if session.status != "active":
            raise SessionNotActiveException()

        # Get next sequence
        result = await self.db.execute(
            select(SessionMessage)
            .where(SessionMessage.session_id == session.id)
            .order_by(SessionMessage.sequence.desc())
            .limit(1)
        )
        last_message = result.scalar_one_or_none()
        next_sequence = (last_message.sequence + 1) if last_message else 1

        message = SessionMessage(
            session_id=session.id,
            sequence=next_sequence,
            role=role,
            content=content,
        )
        self.db.add(message)

        session.last_activity = datetime.utcnow()

        return message

    async def get_operations(self, session_id: str) -> list[SessionOperation]:
        """Get all operations for a session."""
        result = await self.db.execute(
            select(SessionOperation)
            .where(SessionOperation.session_id == session_id)
            .order_by(SessionOperation.sequence)
        )
        return list(result.scalars().all())

    async def add_operation(
        self,
        session: Session,
        operation_type: str,
        record: Record,
        before_snapshot: dict | None,
        after_snapshot: dict,
        from_area: str | None = None,
        to_area: str | None = None,
    ) -> SessionOperation:
        """Add an operation to the session."""
        if session.status != "active":
            raise SessionNotActiveException()

        # Get next sequence
        result = await self.db.execute(
            select(SessionOperation)
            .where(SessionOperation.session_id == session.id)
            .order_by(SessionOperation.sequence.desc())
            .limit(1)
        )
        last_op = result.scalar_one_or_none()
        next_sequence = (last_op.sequence + 1) if last_op else 1

        operation = SessionOperation(
            session_id=session.id,
            sequence=next_sequence,
            operation_type=operation_type,
            record_id=record.id,
            area=record.area,
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
            from_area=from_area,
            to_area=to_area,
        )
        self.db.add(operation)

        # Update session summary
        summary = session.changes_summary.copy()
        if operation_type == "create":
            summary["created"] = summary.get("created", 0) + 1
        elif operation_type == "update":
            summary["updated"] = summary.get("updated", 0) + 1
        elif operation_type == "delete":
            summary["deleted"] = summary.get("deleted", 0) + 1
        elif operation_type == "transfer":
            summary["transferred"] = summary.get("transferred", 0) + 1

        session.changes_summary = summary
        session.changes_count = session.changes_count + 1
        session.last_activity = datetime.utcnow()

        return operation

    async def undo_operation(self, session: Session, user: User) -> UndoResponse:
        """Undo the last non-undone operation."""
        if session.status != "active":
            raise SessionNotActiveException()

        # Find last non-undone operation
        result = await self.db.execute(
            select(SessionOperation)
            .where(
                SessionOperation.session_id == session.id,
                SessionOperation.is_undone == False,  # noqa: E712
            )
            .order_by(SessionOperation.sequence.desc())
            .limit(1)
        )
        operation = result.scalar_one_or_none()

        if not operation:
            raise ValidationException("Nothing to undo")

        # Get the record
        result = await self.db.execute(select(Record).where(Record.id == operation.record_id))
        record = result.scalar_one_or_none()

        if operation.operation_type == "create":
            # Mark as deleted
            if record:
                record.deleted_at = datetime.utcnow()
                record.deleted_by = user.id
        elif operation.operation_type == "delete":
            # Restore record
            if record:
                record.deleted_at = None
                record.deleted_by = None
        elif operation.operation_type in ("update", "transfer"):
            # Restore before_snapshot
            if record and operation.before_snapshot:
                self._apply_snapshot(record, operation.before_snapshot)

        operation.is_undone = True
        operation.undone_at = datetime.utcnow()

        # Add system message
        message = await self.add_message(
            session, f"Undo: {operation.operation_type} operation reverted", "system"
        )
        await self.db.flush()
        await self.db.refresh(message)
        await self.db.refresh(operation)

        session.last_activity = datetime.utcnow()

        return UndoResponse(
            undone_operation=OperationResponse.model_validate(operation),
            message=MessageResponse.model_validate(message),
        )

    async def redo_operation(self, session: Session, user: User) -> RedoResponse:
        """Redo the last undone operation."""
        if session.status != "active":
            raise SessionNotActiveException()

        # Find last undone operation
        result = await self.db.execute(
            select(SessionOperation)
            .where(
                SessionOperation.session_id == session.id,
                SessionOperation.is_undone == True,  # noqa: E712
            )
            .order_by(SessionOperation.sequence.asc())
            .limit(1)
        )
        operation = result.scalar_one_or_none()

        if not operation:
            raise ValidationException("Nothing to redo")

        # Get the record
        result = await self.db.execute(select(Record).where(Record.id == operation.record_id))
        record = result.scalar_one_or_none()

        if operation.operation_type == "create":
            # Restore record
            if record:
                record.deleted_at = None
                record.deleted_by = None
        elif operation.operation_type == "delete":
            # Delete again
            if record:
                record.deleted_at = datetime.utcnow()
                record.deleted_by = user.id
        elif operation.operation_type in ("update", "transfer"):
            # Apply after_snapshot
            if record:
                self._apply_snapshot(record, operation.after_snapshot)

        operation.is_undone = False
        operation.undone_at = None

        # Add system message
        message = await self.add_message(
            session, f"Redo: {operation.operation_type} operation reapplied", "system"
        )
        await self.db.flush()
        await self.db.refresh(message)
        await self.db.refresh(operation)

        session.last_activity = datetime.utcnow()

        return RedoResponse(
            redone_operation=OperationResponse.model_validate(operation),
            message=MessageResponse.model_validate(message),
        )

    async def check_conflicts(self, session: Session) -> list[ConflictInfo]:
        """Check for conflicts before commit."""
        conflicts = []

        result = await self.db.execute(
            select(SessionRecordLock)
            .where(SessionRecordLock.session_id == session.id)
        )
        locks = result.scalars().all()

        for lock in locks:
            result = await self.db.execute(
                select(Record).where(Record.id == lock.record_id)
            )
            record = result.scalar_one_or_none()

            if record and record.version != lock.base_version:
                # Get who modified
                result = await self.db.execute(
                    select(User).where(User.id == record.updated_by)
                )
                modifier = result.scalar_one_or_none()

                conflicts.append(
                    ConflictInfo(
                        record_id=record.id,
                        area=record.area,
                        your_version=lock.draft_snapshot,
                        current_version=self._record_to_snapshot(record),
                        modified_by=SessionUser(
                            id=modifier.id if modifier else "unknown",
                            name=modifier.name if modifier else "Unknown User",
                        ),
                        modified_at=record.updated_at,
                    )
                )

        return conflicts

    async def commit_session(
        self, session: Session, user: User, message: str | None = None
    ) -> CommitResponse:
        """Commit all changes in the session."""
        if session.status != "active":
            raise SessionNotActiveException()

        # Check for conflicts
        conflicts = await self.check_conflicts(session)
        if conflicts:
            raise ConflictException(details={"conflicts": [c.model_dump() for c in conflicts]})

        # Apply all lock snapshots to records
        result = await self.db.execute(
            select(SessionRecordLock)
            .where(SessionRecordLock.session_id == session.id)
        )
        locks = result.scalars().all()

        for lock in locks:
            result = await self.db.execute(
                select(Record).where(Record.id == lock.record_id)
            )
            record = result.scalar_one_or_none()
            if record:
                self._apply_snapshot(record, lock.draft_snapshot)
                record.version += 1
                record.updated_by = user.id
                record.updated_at = datetime.utcnow()

        # Add commit message before changing status
        await self._add_system_message(
            session, f"Session committed: {message or 'No message'}"
        )

        # Update session status
        session.status = "committed"
        session.committed_at = datetime.utcnow()
        session.commit_message = message

        return CommitResponse(
            changes_committed=session.changes_count,
            session=self._session_to_response(session),
        )

    async def resolve_conflicts(
        self,
        session: Session,
        user: User,
        resolutions: list[ConflictResolution],
        commit_message: str | None = None,
    ) -> CommitResponse:
        """Resolve conflicts and commit."""
        if session.status != "active":
            raise SessionNotActiveException()

        for resolution in resolutions:
            result = await self.db.execute(
                select(SessionRecordLock)
                .where(
                    SessionRecordLock.session_id == session.id,
                    SessionRecordLock.record_id == resolution.record_id,
                )
            )
            lock = result.scalar_one_or_none()

            result = await self.db.execute(
                select(Record).where(Record.id == resolution.record_id)
            )
            record = result.scalar_one_or_none()

            if not lock or not record:
                continue

            if resolution.strategy == "keep_theirs":
                # Update lock to match current record
                lock.draft_snapshot = self._record_to_snapshot(record)
            elif resolution.strategy == "manual" and resolution.manual_values:
                # Apply manual values
                lock.draft_snapshot.update(resolution.manual_values)
            # keep_mine: do nothing, lock already has user's values

            # Update base_version to current
            lock.base_version = record.version

        # Now commit
        return await self.commit_session(session, user, commit_message)

    async def discard_session(self, session: Session, user: User) -> DiscardResponse:
        """Discard all changes and close session."""
        if session.status != "active":
            raise SessionNotActiveException()

        changes_discarded = session.changes_count

        # Delete records that were created in this session
        result = await self.db.execute(
            select(SessionOperation)
            .where(
                SessionOperation.session_id == session.id,
                SessionOperation.operation_type == "create",
                SessionOperation.is_undone == False,  # noqa: E712
            )
        )
        create_ops = result.scalars().all()

        for op in create_ops:
            result = await self.db.execute(
                select(Record).where(Record.id == op.record_id)
            )
            record = result.scalar_one_or_none()
            if record:
                await self.db.delete(record)

        # Restore records that were modified
        result = await self.db.execute(
            select(SessionOperation)
            .where(
                SessionOperation.session_id == session.id,
                SessionOperation.operation_type.in_(["update", "delete", "transfer"]),
                SessionOperation.is_undone == False,  # noqa: E712
            )
        )
        modify_ops = result.scalars().all()

        for op in modify_ops:
            if op.before_snapshot:
                result = await self.db.execute(
                    select(Record).where(Record.id == op.record_id)
                )
                record = result.scalar_one_or_none()
                if record:
                    self._apply_snapshot(record, op.before_snapshot)
                    if op.operation_type == "delete":
                        record.deleted_at = None
                        record.deleted_by = None

        # Update session status
        session.status = "discarded"
        session.discarded_at = datetime.utcnow()

        return DiscardResponse(
            session=self._session_to_response(session),
            changes_discarded=changes_discarded,
        )

    async def _add_system_message(self, session: Session, content: str) -> SessionMessage:
        """Add a system message without status check (for commit/discard)."""
        result = await self.db.execute(
            select(SessionMessage)
            .where(SessionMessage.session_id == session.id)
            .order_by(SessionMessage.sequence.desc())
            .limit(1)
        )
        last_message = result.scalar_one_or_none()
        next_sequence = (last_message.sequence + 1) if last_message else 1

        message = SessionMessage(
            session_id=session.id,
            sequence=next_sequence,
            role="system",
            content=content,
        )
        self.db.add(message)
        return message

    def _apply_snapshot(self, record: Record, snapshot: dict[str, Any]) -> None:
        """Apply snapshot values to record."""
        for key, value in snapshot.items():
            if hasattr(record, key) and key not in ("id", "workspace_id", "version"):
                setattr(record, key, value)

    def _record_to_snapshot(self, record: Record) -> dict[str, Any]:
        """Convert record to snapshot dict."""
        return {
            "area": record.area,
            "type": record.type,
            "account": record.account,
            "reference": record.reference,
            "note": record.note,
            "date_cashflow": record.date_cashflow.isoformat() if record.date_cashflow else None,
            "date_offer": record.date_offer.isoformat() if record.date_offer else None,
            "amount": str(record.amount),
            "vat": str(record.vat),
            "total": str(record.total),
            "stage": record.stage,
            "transaction_id": record.transaction_id,
            "bank_account_id": record.bank_account_id,
            "project_code": record.project_code,
        }

    def _session_to_response(self, session: Session) -> SessionResponse:
        """Convert session to response."""
        return SessionResponse(
            id=session.id,
            title=session.title,
            user=SessionUser(id=session.user_id, name=session.user.name if session.user else ""),
            status=session.status,
            created_at=session.created_at,
            last_activity=session.last_activity,
            committed_at=session.committed_at,
            discarded_at=session.discarded_at,
            commit_message=session.commit_message,
            changes_count=session.changes_count,
            changes_summary=session.changes_summary,
        )
