"""Admin service for registration codes and user management."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from forecasto.exceptions import (
    ForbiddenException,
    NotFoundException,
    ValidationException,
)
from forecasto.models.registration_code import (
    RegistrationCode,
    RegistrationCodeBatch,
    generate_registration_code,
)
from forecasto.models.user import User
from forecasto.schemas.admin import (
    AdminUserResponse,
    BatchResponse,
    BatchWithCodesResponse,
    CodeFilter,
    CreateBatchRequest,
    RegistrationCodeResponse,
    UserFilter,
)


class AdminService:
    """Service for admin operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_batch(
        self, data: CreateBatchRequest, admin_user: User
    ) -> BatchWithCodesResponse:
        """Create a batch of registration codes."""
        expires_at = None
        if data.expires_in_days:
            expires_at = datetime.utcnow() + timedelta(days=data.expires_in_days)

        batch = RegistrationCodeBatch(
            name=data.name,
            created_by_id=admin_user.id,
            expires_at=expires_at,
            note=data.note,
        )
        self.db.add(batch)
        await self.db.flush()

        codes = []
        used_codes = set()
        for _ in range(data.count):
            code_str = generate_registration_code()
            while code_str in used_codes:
                code_str = generate_registration_code()
            used_codes.add(code_str)

            code = RegistrationCode(
                code=code_str,
                batch_id=batch.id,
                expires_at=expires_at,
            )
            self.db.add(code)
            codes.append(code)

        await self.db.flush()

        return BatchWithCodesResponse(
            id=batch.id,
            name=batch.name,
            created_at=batch.created_at,
            expires_at=batch.expires_at,
            note=batch.note,
            codes=[
                RegistrationCodeResponse(
                    id=c.id,
                    code=c.code,
                    created_at=c.created_at,
                    expires_at=c.expires_at,
                )
                for c in codes
            ],
        )

    async def list_batches(self) -> list[BatchResponse]:
        """List all registration code batches with statistics."""
        result = await self.db.execute(
            select(RegistrationCodeBatch).order_by(
                RegistrationCodeBatch.created_at.desc()
            )
        )
        batches = result.scalars().all()

        response = []
        for batch in batches:
            # Get code statistics
            stats = await self.db.execute(
                select(
                    func.count(RegistrationCode.id).label("total"),
                    func.count(RegistrationCode.used_at).label("used"),
                ).where(RegistrationCode.batch_id == batch.id)
            )
            row = stats.one()
            total = row.total
            used = row.used

            response.append(
                BatchResponse(
                    id=batch.id,
                    name=batch.name,
                    created_at=batch.created_at,
                    expires_at=batch.expires_at,
                    note=batch.note,
                    total_codes=total,
                    used_codes=used,
                    available_codes=total - used,
                )
            )

        return response

    async def get_batch(self, batch_id: str) -> BatchWithCodesResponse:
        """Get batch with all codes."""
        result = await self.db.execute(
            select(RegistrationCodeBatch)
            .options(joinedload(RegistrationCodeBatch.codes))
            .where(RegistrationCodeBatch.id == batch_id)
        )
        batch = result.unique().scalar_one_or_none()
        if not batch:
            raise NotFoundException(f"Batch {batch_id} not found")

        codes_response = []
        for code in batch.codes:
            used_by_email = None
            used_by_name = None
            if code.used_by_id:
                user_result = await self.db.execute(
                    select(User).where(User.id == code.used_by_id)
                )
                user = user_result.scalar_one_or_none()
                if user:
                    used_by_email = user.email
                    used_by_name = user.name

            codes_response.append(
                RegistrationCodeResponse(
                    id=code.id,
                    code=code.code,
                    created_at=code.created_at,
                    expires_at=code.expires_at,
                    used_at=code.used_at,
                    used_by_id=code.used_by_id,
                    used_by_email=used_by_email,
                    used_by_name=used_by_name,
                    revoked_at=code.revoked_at,
                )
            )

        return BatchWithCodesResponse(
            id=batch.id,
            name=batch.name,
            created_at=batch.created_at,
            expires_at=batch.expires_at,
            note=batch.note,
            codes=codes_response,
        )

    async def list_codes(self, filters: CodeFilter) -> tuple[list[RegistrationCodeResponse], int]:
        """List registration codes with filtering."""
        query = select(RegistrationCode)

        if filters.batch_id:
            query = query.where(RegistrationCode.batch_id == filters.batch_id)

        now = datetime.utcnow()
        if filters.status == "available":
            query = query.where(
                RegistrationCode.used_at.is_(None),
                RegistrationCode.revoked_at.is_(None),
                (
                    RegistrationCode.expires_at.is_(None)
                    | (RegistrationCode.expires_at > now)
                ),
            )
        elif filters.status == "used":
            query = query.where(RegistrationCode.used_at.isnot(None))
        elif filters.status == "revoked":
            query = query.where(RegistrationCode.revoked_at.isnot(None))
        elif filters.status == "expired":
            query = query.where(
                RegistrationCode.expires_at.isnot(None),
                RegistrationCode.expires_at <= now,
                RegistrationCode.used_at.is_(None),
            )

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Apply pagination
        offset = (filters.page - 1) * filters.page_size
        query = query.order_by(RegistrationCode.created_at.desc())
        query = query.offset(offset).limit(filters.page_size)

        result = await self.db.execute(query)
        codes = result.scalars().all()

        response = []
        for code in codes:
            used_by_email = None
            used_by_name = None
            if code.used_by_id:
                user_result = await self.db.execute(
                    select(User).where(User.id == code.used_by_id)
                )
                user = user_result.scalar_one_or_none()
                if user:
                    used_by_email = user.email
                    used_by_name = user.name

            response.append(
                RegistrationCodeResponse(
                    id=code.id,
                    code=code.code,
                    created_at=code.created_at,
                    expires_at=code.expires_at,
                    used_at=code.used_at,
                    used_by_id=code.used_by_id,
                    used_by_email=used_by_email,
                    used_by_name=used_by_name,
                    revoked_at=code.revoked_at,
                )
            )

        return response, total

    async def get_code(self, code_id: str) -> RegistrationCodeResponse:
        """Get a single registration code."""
        result = await self.db.execute(
            select(RegistrationCode).where(RegistrationCode.id == code_id)
        )
        code = result.scalar_one_or_none()
        if not code:
            raise NotFoundException(f"Code {code_id} not found")

        used_by_email = None
        used_by_name = None
        if code.used_by_id:
            user_result = await self.db.execute(
                select(User).where(User.id == code.used_by_id)
            )
            user = user_result.scalar_one_or_none()
            if user:
                used_by_email = user.email
                used_by_name = user.name

        return RegistrationCodeResponse(
            id=code.id,
            code=code.code,
            created_at=code.created_at,
            expires_at=code.expires_at,
            used_at=code.used_at,
            used_by_id=code.used_by_id,
            used_by_email=used_by_email,
            used_by_name=used_by_name,
            revoked_at=code.revoked_at,
        )

    async def revoke_code(self, code_id: str) -> RegistrationCodeResponse:
        """Revoke a registration code."""
        result = await self.db.execute(
            select(RegistrationCode).where(RegistrationCode.id == code_id)
        )
        code = result.scalar_one_or_none()
        if not code:
            raise NotFoundException(f"Code {code_id} not found")

        if code.used_at:
            raise ValidationException("Cannot revoke a code that has been used")

        code.revoked_at = datetime.utcnow()
        await self.db.flush()

        return RegistrationCodeResponse(
            id=code.id,
            code=code.code,
            created_at=code.created_at,
            expires_at=code.expires_at,
            used_at=code.used_at,
            used_by_id=code.used_by_id,
            revoked_at=code.revoked_at,
        )

    async def validate_registration_code(self, code_str: str) -> RegistrationCode:
        """Validate and return a registration code for use during registration.

        Raises ValidationException if the code is invalid.
        """
        result = await self.db.execute(
            select(RegistrationCode).where(RegistrationCode.code == code_str)
        )
        code = result.scalar_one_or_none()

        if not code:
            raise ValidationException("Codice di registrazione non valido")

        if code.used_at:
            raise ValidationException("Codice di registrazione già utilizzato")

        if code.revoked_at:
            raise ValidationException("Codice di registrazione revocato")

        now = datetime.utcnow()
        if code.expires_at and code.expires_at <= now:
            raise ValidationException("Codice di registrazione scaduto")

        return code

    async def mark_code_used(self, code: RegistrationCode, user_id: str) -> None:
        """Mark a registration code as used."""
        code.used_at = datetime.utcnow()
        code.used_by_id = user_id

    async def list_users(self, filters: UserFilter) -> tuple[list[AdminUserResponse], int]:
        """List users with filtering."""
        query = select(User)

        if filters.search:
            search_pattern = f"%{filters.search}%"
            query = query.where(
                (User.email.ilike(search_pattern)) | (User.name.ilike(search_pattern))
            )

        if filters.status == "active":
            query = query.where(User.is_blocked == False)  # noqa: E712
        elif filters.status == "blocked":
            query = query.where(User.is_blocked == True)  # noqa: E712
        elif filters.status == "admin":
            query = query.where(User.is_admin == True)  # noqa: E712

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Apply pagination
        offset = (filters.page - 1) * filters.page_size
        query = query.order_by(User.created_at.desc())
        query = query.offset(offset).limit(filters.page_size)

        result = await self.db.execute(query)
        users = result.scalars().all()

        response = []
        for user in users:
            registration_code = None
            if user.registration_code_id:
                code_result = await self.db.execute(
                    select(RegistrationCode).where(
                        RegistrationCode.id == user.registration_code_id
                    )
                )
                code = code_result.scalar_one_or_none()
                if code:
                    registration_code = code.code

            response.append(
                AdminUserResponse(
                    id=user.id,
                    email=user.email,
                    name=user.name,
                    is_admin=user.is_admin,
                    is_blocked=user.is_blocked,
                    blocked_at=user.blocked_at,
                    blocked_reason=user.blocked_reason,
                    registration_code_id=user.registration_code_id,
                    registration_code=registration_code,
                    created_at=user.created_at,
                    last_login_at=user.last_login_at,
                )
            )

        return response, total

    async def get_user(self, user_id: str) -> AdminUserResponse:
        """Get a single user."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException(f"User {user_id} not found")

        registration_code = None
        if user.registration_code_id:
            code_result = await self.db.execute(
                select(RegistrationCode).where(
                    RegistrationCode.id == user.registration_code_id
                )
            )
            code = code_result.scalar_one_or_none()
            if code:
                registration_code = code.code

        return AdminUserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            is_admin=user.is_admin,
            is_blocked=user.is_blocked,
            blocked_at=user.blocked_at,
            blocked_reason=user.blocked_reason,
            registration_code_id=user.registration_code_id,
            registration_code=registration_code,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
        )

    async def block_user(
        self, user_id: str, reason: str | None, admin_user: User
    ) -> AdminUserResponse:
        """Block a user."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException(f"User {user_id} not found")

        if user.id == admin_user.id:
            raise ForbiddenException("Cannot block yourself")

        if user.is_admin:
            raise ForbiddenException("Cannot block an admin user")

        user.is_blocked = True
        user.blocked_at = datetime.utcnow()
        user.blocked_reason = reason
        await self.db.flush()

        return await self.get_user(user_id)

    async def unblock_user(self, user_id: str) -> AdminUserResponse:
        """Unblock a user."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException(f"User {user_id} not found")

        user.is_blocked = False
        user.blocked_at = None
        user.blocked_reason = None
        await self.db.flush()

        return await self.get_user(user_id)
