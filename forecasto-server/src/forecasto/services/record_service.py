"""Record service."""

from __future__ import annotations


from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import ForbiddenException, NotFoundException
from forecasto.models.record import Record
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.record import RecordCreate, RecordFilter, RecordUpdate


def get_sign_from_amount(amount: Decimal | str | float) -> str:
    """Get sign (in/out) from amount value."""
    if isinstance(amount, str):
        amount = Decimal(amount)
    elif isinstance(amount, float):
        amount = Decimal(str(amount))
    return "in" if amount >= 0 else "out"


def check_granular_permission(
    member: WorkspaceMember,
    area: str,
    sign: str,
    permission: str,
    record_creator_id: str | None = None,
    current_user_id: str | None = None,
) -> bool:
    """
    Check if member has the specified granular permission.

    Args:
        member: The workspace member to check
        area: The area (budget, prospect, orders, actual)
        sign: The sign (in, out)
        permission: The permission to check (can_read_others, can_create, can_edit_others)
        record_creator_id: The user ID who created the record (for edit_others check)
        current_user_id: The current user ID (for edit_others check)

    Returns:
        True if permitted, False otherwise
    """
    # Owner and admin have all permissions
    if member.role in ("owner", "admin"):
        return True

    # Get granular permissions, with fallback to default all-true
    granular = member.granular_permissions or {}
    area_perms = granular.get(area, {})
    sign_perms = area_perms.get(sign, {})

    # Default to True for backwards compatibility
    perm_value = sign_perms.get(permission, True)

    # Special handling for can_edit_others/can_delete_others: if editing/deleting own record, always allowed
    if permission in ("can_edit_others", "can_delete_others"):
        if record_creator_id and current_user_id and record_creator_id == current_user_id:
            return True  # Can always edit/delete own records

    return perm_value


class RecordService:
    """Service for record operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_record(
        self,
        workspace_id: str,
        data: RecordCreate,
        user: User,
        member: WorkspaceMember | None = None,
    ) -> Record:
        """Create a new record."""
        # Check granular permission if member provided
        if member:
            sign = get_sign_from_amount(data.amount)
            if not check_granular_permission(member, data.area, sign, "can_create"):
                raise ForbiddenException(
                    f"You don't have permission to create {sign} records in {data.area}"
                )

        review_date = data.review_date or (data.date_offer + timedelta(days=7))

        # Get workspace owner and assign sequential number
        ws_result = await self.db.execute(
            select(Workspace.owner_id).where(Workspace.id == workspace_id)
        )
        owner_id = ws_result.scalar_one()
        owner_result = await self.db.execute(
            select(User).where(User.id == owner_id).with_for_update()
        )
        owner_user = owner_result.scalar_one()
        seq_num = owner_user.next_seq_num
        owner_user.next_seq_num = seq_num + 1

        record = Record(
            workspace_id=workspace_id,
            area=data.area,
            type=data.type,
            account=data.account,
            reference=data.reference,
            note=data.note,
            date_cashflow=data.date_cashflow,
            date_offer=data.date_offer,
            owner=data.owner,
            nextaction=data.nextaction,
            amount=data.amount,
            vat=data.vat,
            vat_deduction=data.vat_deduction,
            total=data.total,
            stage=data.stage,
            transaction_id=data.transaction_id,
            bank_account_id=data.bank_account_id,
            project_code=data.project_code,
            review_date=review_date,
            seq_num=seq_num,
            classification=data.classification or {},
            created_by=user.id,
            updated_by=user.id,
        )
        self.db.add(record)
        await self.db.flush()

        return record

    async def get_record(self, record_id: str, workspace_id: str) -> Record:
        """Get a record by ID."""
        result = await self.db.execute(
            select(Record).where(
                Record.id == record_id,
                Record.workspace_id == workspace_id,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            raise NotFoundException(f"Record {record_id} not found")
        return record

    async def list_records(
        self,
        workspace_id: str,
        filters: RecordFilter,
        member: WorkspaceMember | None = None,
        current_user_id: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> tuple[list[Record], int]:
        """List records with filters and permission-based filtering."""
        query = select(Record).where(Record.workspace_id == workspace_id)

        if filters.area:
            query = query.where(Record.area == filters.area)

        if filters.date_start:
            query = query.where(Record.date_cashflow >= filters.date_start)

        if filters.date_end:
            query = query.where(Record.date_cashflow <= filters.date_end)

        if filters.sign == "in":
            query = query.where(Record.amount > 0)
        elif filters.sign == "out":
            query = query.where(Record.amount < 0)

        if filters.text_filter:
            search = f"%{filters.text_filter}%"
            field = filters.text_filter_field
            if field and hasattr(Record, field):
                query = query.where(getattr(Record, field).ilike(search))
            else:
                query = query.where(
                    or_(
                        Record.account.ilike(search),
                        Record.reference.ilike(search),
                        Record.note.ilike(search),
                        Record.transaction_id.ilike(search),
                    )
                )

        if filters.project_code:
            query = query.where(Record.project_code.ilike(f"%{filters.project_code}%"))

        if filters.bank_account_id:
            query = query.where(Record.bank_account_id == filters.bank_account_id)

        if not filters.include_deleted:
            query = query.where(Record.deleted_at.is_(None))

        query = query.order_by(Record.date_cashflow, Record.created_at)

        # COUNT total matching records (before pagination)
        count_result = await self.db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar_one()

        # Apply pagination at SQL level
        if offset:
            query = query.offset(offset)
        if limit is not None:
            query = query.limit(limit)

        result = await self.db.execute(query)
        records = list(result.scalars().all())

        # Apply granular permission filtering if member provided
        if member and current_user_id:
            filtered_records = []
            for record in records:
                sign = get_sign_from_amount(record.amount)
                # Check if user can read this record
                can_read = check_granular_permission(
                    member, record.area, sign, "can_read_others",
                    record.created_by, current_user_id
                )
                # User can always see their own records
                if can_read or record.created_by == current_user_id:
                    filtered_records.append(record)
            records = filtered_records

        return records, total

    async def update_record(
        self,
        record: Record,
        data: RecordUpdate,
        user: User,
        member: WorkspaceMember | None = None,
    ) -> Record:
        """Update a record."""
        # Check granular permission if member provided
        if member:
            sign = get_sign_from_amount(record.amount)
            if not check_granular_permission(
                member, record.area, sign, "can_edit_others",
                record.created_by, user.id
            ):
                raise ForbiddenException(
                    f"You don't have permission to edit records created by others in {record.area}"
                )

        # Apply updates
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if hasattr(record, key):
                setattr(record, key, value)

        record.updated_by = user.id
        record.updated_at = datetime.utcnow()
        record.version += 1

        return record

    async def delete_record(
        self,
        record: Record,
        user: User,
        member: WorkspaceMember | None = None,
    ) -> Record:
        """Soft delete a record."""
        # Check granular permission if member provided
        if member:
            sign = get_sign_from_amount(record.amount)
            if not check_granular_permission(
                member, record.area, sign, "can_delete_others",
                record.created_by, user.id
            ):
                raise ForbiddenException(
                    f"You don't have permission to delete records created by others in {record.area}"
                )

        record.deleted_at = datetime.utcnow()
        record.deleted_by = user.id
        record.version += 1

        return record
