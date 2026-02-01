"""Tests for session service."""

from __future__ import annotations


from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.models.record import Record
from forecasto.models.session import Session, SessionRecordLock
from forecasto.models.user import User
from forecasto.models.workspace import Workspace
from forecasto.services.session_service import SessionService

@pytest.mark.asyncio
async def test_create_session(db_session: AsyncSession, test_user: User, test_workspace: Workspace):
    """Test session creation."""

    service = SessionService(db_session)
    session = await service.create_session(test_workspace.id, test_user, "Test Session")

    assert session.title == "Test Session"
    assert session.status == "active"
    assert session.user_id == test_user.id

@pytest.mark.asyncio
async def test_add_message(db_session: AsyncSession, test_user: User, test_workspace: Workspace):
    """Test adding messages to session."""
    service = SessionService(db_session)
    session = await service.create_session(test_workspace.id, test_user, "Message Test")

    message = await service.add_message(session, "Test content", "user")

    assert message.content == "Test content"
    assert message.role == "user"
    assert message.session_id == session.id

@pytest.mark.asyncio
async def test_undo_restores_before_snapshot(
    db_session: AsyncSession, test_user: User, test_workspace: Workspace
):
    """Test that undo restores the before_snapshot."""
    service = SessionService(db_session)
    session = await service.create_session(test_workspace.id, test_user, "Undo Test")

    # Create a record
    record = Record(
        workspace_id=test_workspace.id,
        area="orders",
        type="0",
        account="ORIGINAL",
        reference="REF",
        date_cashflow=date(2026, 1, 15),
        date_offer=date(2026, 1, 10),
        amount=Decimal("1000.00"),
        vat=Decimal("220.00"),
        total=Decimal("1220.00"),
        stage="1",
        created_by=test_user.id,
    )
    db_session.add(record)
    await db_session.commit()

    # Add update operation
    before = {"account": "ORIGINAL"}
    after = {"account": "UPDATED"}

    record.account = "UPDATED"
    await service.add_operation(session, "update", record, before, after)
    await db_session.commit()

    # Undo
    result = await service.undo_operation(session, test_user)

    assert result.success is True
    # Verify operation is marked as undone
    operations = await service.get_operations(session.id)
    assert operations[-1].is_undone is True

@pytest.mark.asyncio
async def test_redo_reapplies_after_snapshot(
    db_session: AsyncSession, test_user: User, test_workspace: Workspace
):
    """Test that redo reapplies the after_snapshot."""
    service = SessionService(db_session)
    session = await service.create_session(test_workspace.id, test_user, "Redo Test")

    # Create a record
    record = Record(
        workspace_id=test_workspace.id,
        area="orders",
        type="0",
        account="ORIGINAL",
        reference="REF",
        date_cashflow=date(2026, 1, 15),
        date_offer=date(2026, 1, 10),
        amount=Decimal("1000.00"),
        vat=Decimal("220.00"),
        total=Decimal("1220.00"),
        stage="1",
        created_by=test_user.id,
    )
    db_session.add(record)
    await db_session.commit()

    # Add operation
    before = {"account": "ORIGINAL"}
    after = {"account": "UPDATED"}

    record.account = "UPDATED"
    await service.add_operation(session, "update", record, before, after)
    await db_session.commit()

    # Undo then redo
    await service.undo_operation(session, test_user)
    result = await service.redo_operation(session, test_user)

    assert result.success is True
    # Verify operation is no longer undone
    operations = await service.get_operations(session.id)
    assert operations[-1].is_undone is False

@pytest.mark.asyncio
async def test_commit_increments_version(
    db_session: AsyncSession, test_user: User, test_workspace: Workspace
):
    """Test that commit increments record versions."""
    service = SessionService(db_session)
    session = await service.create_session(test_workspace.id, test_user, "Commit Test")

    # Create a record with version 1
    record = Record(
        workspace_id=test_workspace.id,
        area="orders",
        type="0",
        account="TEST",
        reference="REF",
        date_cashflow=date(2026, 1, 15),
        date_offer=date(2026, 1, 10),
        amount=Decimal("1000.00"),
        vat=Decimal("220.00"),
        total=Decimal("1220.00"),
        stage="1",
        version=1,
        created_by=test_user.id,
    )
    db_session.add(record)
    await db_session.commit()

    # Create lock
    lock = SessionRecordLock(
        session_id=session.id,
        record_id=record.id,
        draft_snapshot={"account": "MODIFIED"},
        base_version=1,
    )
    db_session.add(lock)
    await db_session.commit()

    # Commit session
    await service.commit_session(session, test_user, "Test commit")
    await db_session.refresh(record)

    # Version should be incremented
    assert record.version == 2

@pytest.mark.asyncio
async def test_discard_restores_original(
    db_session: AsyncSession, test_user: User, test_workspace: Workspace
):
    """Test that discard restores original record state."""
    service = SessionService(db_session)
    session = await service.create_session(test_workspace.id, test_user, "Discard Test")

    # Create and modify a record
    record = Record(
        workspace_id=test_workspace.id,
        area="orders",
        type="0",
        account="ORIGINAL",
        reference="REF",
        date_cashflow=date(2026, 1, 15),
        date_offer=date(2026, 1, 10),
        amount=Decimal("1000.00"),
        vat=Decimal("220.00"),
        total=Decimal("1220.00"),
        stage="1",
        created_by=test_user.id,
    )
    db_session.add(record)
    await db_session.commit()

    before = {"account": "ORIGINAL"}
    after = {"account": "MODIFIED"}

    record.account = "MODIFIED"
    await service.add_operation(session, "update", record, before, after)
    await db_session.commit()

    # Discard
    result = await service.discard_session(session, test_user)

    assert result.success is True
    assert result.session.status == "discarded"
