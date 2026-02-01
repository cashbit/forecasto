"""Tests for record service."""

from __future__ import annotations


from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.models.record import Record, RecordVersion
from forecasto.models.session import Session, SessionRecordLock
from forecasto.models.user import User
from forecasto.models.workspace import Workspace
from forecasto.schemas.record import RecordCreate, RecordFilter, RecordUpdate
from forecasto.services.record_service import RecordService
from forecasto.services.session_service import SessionService

@pytest.mark.asyncio
async def test_create_record(
    db_session: AsyncSession, test_user: User, test_workspace: Workspace
):
    """Test record creation."""

    # Create session first
    session_service = SessionService(db_session)
    session = await session_service.create_session(test_workspace.id, test_user, "Test")

    record_service = RecordService(db_session)
    data = RecordCreate(
        area="orders",
        type="0",
        account="TEST ACCOUNT",
        reference="TEST REF",
        date_cashflow=date(2026, 1, 15),
        date_offer=date(2026, 1, 10),
        amount=Decimal("1000.00"),
        vat=Decimal("220.00"),
        total=Decimal("1220.00"),
        stage="1",
    )

    record = await record_service.create_record(test_workspace.id, data, test_user, session)

    assert record.account == "TEST ACCOUNT"
    assert record.area == "orders"
    assert record.workspace_id == test_workspace.id

@pytest.mark.asyncio
async def test_record_lock_created_on_edit(
    db_session: AsyncSession, test_user: User, test_workspace: Workspace
):
    """Test that session lock is created when editing."""
    session_service = SessionService(db_session)
    session = await session_service.create_session(test_workspace.id, test_user, "Lock Test")

    record_service = RecordService(db_session)
    data = RecordCreate(
        area="orders",
        type="0",
        account="LOCK TEST",
        reference="REF",
        date_cashflow=date(2026, 1, 15),
        date_offer=date(2026, 1, 10),
        amount=Decimal("1000.00"),
        vat=Decimal("220.00"),
        total=Decimal("1220.00"),
        stage="1",
    )

    record = await record_service.create_record(test_workspace.id, data, test_user, session)
    await db_session.commit()

    # Update record
    update_data = RecordUpdate(account="UPDATED")
    await record_service.update_record(record, update_data, test_user, session)
    await db_session.commit()

    # Check lock exists
    result = await db_session.execute(
        select(SessionRecordLock).where(
            SessionRecordLock.session_id == session.id,
            SessionRecordLock.record_id == record.id,
        )
    )
    lock = result.scalar_one_or_none()

    assert lock is not None
    assert lock.draft_snapshot["account"] == "UPDATED"

@pytest.mark.asyncio
async def test_version_history_saved(
    db_session: AsyncSession, test_user: User, test_workspace: Workspace
):
    """Test that version history is saved."""
    session_service = SessionService(db_session)
    session = await session_service.create_session(test_workspace.id, test_user, "Version Test")

    record_service = RecordService(db_session)
    data = RecordCreate(
        area="orders",
        type="0",
        account="VERSION TEST",
        reference="REF",
        date_cashflow=date(2026, 1, 15),
        date_offer=date(2026, 1, 10),
        amount=Decimal("1000.00"),
        vat=Decimal("220.00"),
        total=Decimal("1220.00"),
        stage="1",
    )

    record = await record_service.create_record(test_workspace.id, data, test_user, session)
    await db_session.commit()

    # Check version was created
    result = await db_session.execute(
        select(RecordVersion).where(RecordVersion.record_id == record.id)
    )
    versions = list(result.scalars().all())

    assert len(versions) == 1
    assert versions[0].change_type == "create"

@pytest.mark.asyncio
async def test_list_records_with_filters(
    db_session: AsyncSession, test_user: User, test_workspace: Workspace
):
    """Test listing records with filters."""
    session_service = SessionService(db_session)
    session = await session_service.create_session(test_workspace.id, test_user, "Filter Test")

    record_service = RecordService(db_session)

    # Create multiple records
    for i, (area, amount) in enumerate([
        ("orders", Decimal("1000.00")),
        ("orders", Decimal("-500.00")),
        ("actual", Decimal("2000.00")),
    ]):
        data = RecordCreate(
            area=area,
            type="0",
            account=f"FILTER TEST {i}",
            reference="REF",
            date_cashflow=date(2026, 1, 15),
            date_offer=date(2026, 1, 10),
            amount=amount,
            vat=amount * Decimal("0.22"),
            total=amount * Decimal("1.22"),
            stage="1",
        )
        await record_service.create_record(test_workspace.id, data, test_user, session)
    await db_session.commit()

    # Filter by area
    filters = RecordFilter(area="orders")
    records = await record_service.list_records(test_workspace.id, filters)
    assert all(r.area == "orders" for r in records)

    # Filter by sign (inflows)
    filters = RecordFilter(area="orders", sign="in")
    records = await record_service.list_records(test_workspace.id, filters)
    assert all(r.amount > 0 for r in records)

    # Filter by sign (outflows)
    filters = RecordFilter(area="orders", sign="out")
    records = await record_service.list_records(test_workspace.id, filters)
    assert all(r.amount < 0 for r in records)

@pytest.mark.asyncio
async def test_soft_delete(
    db_session: AsyncSession, test_user: User, test_workspace: Workspace
):
    """Test soft delete functionality."""
    session_service = SessionService(db_session)
    session = await session_service.create_session(test_workspace.id, test_user, "Delete Test")

    record_service = RecordService(db_session)
    data = RecordCreate(
        area="orders",
        type="0",
        account="DELETE TEST",
        reference="REF",
        date_cashflow=date(2026, 1, 15),
        date_offer=date(2026, 1, 10),
        amount=Decimal("1000.00"),
        vat=Decimal("220.00"),
        total=Decimal("1220.00"),
        stage="1",
    )

    record = await record_service.create_record(test_workspace.id, data, test_user, session)
    await db_session.commit()

    # Delete
    await record_service.delete_record(record, test_user, session)
    await db_session.commit()

    # Record should have deleted_at set
    await db_session.refresh(record)
    assert record.deleted_at is not None
    assert record.deleted_by == test_user.id

    # Should not appear in normal listing
    filters = RecordFilter(area="orders")
    records = await record_service.list_records(test_workspace.id, filters)
    assert record.id not in [r.id for r in records]
