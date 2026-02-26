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
    ActivatedCodeReportRow,
    ActivatedCodesReportFilter,
    AdminUserResponse,
    BatchResponse,
    BatchWithCodesResponse,
    CodeFilter,
    CreateBatchRequest,
    PartnerBillingSummary,
    RegistrationCodeResponse,
    UserFilter,
)
from forecasto.schemas.partner import PartnerBatchResponse, PartnerCodeResponse


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
            partner_id=data.partner_id,
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

        # Resolve partner name
        partner_name = None
        if batch.partner_id:
            partner_result = await self.db.execute(
                select(User).where(User.id == batch.partner_id)
            )
            partner = partner_result.scalar_one_or_none()
            if partner:
                partner_name = partner.name

        return BatchWithCodesResponse(
            id=batch.id,
            name=batch.name,
            created_at=batch.created_at,
            expires_at=batch.expires_at,
            note=batch.note,
            partner_id=batch.partner_id,
            partner_name=partner_name,
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

            # Resolve partner name
            partner_name = None
            if batch.partner_id:
                partner_result = await self.db.execute(
                    select(User).where(User.id == batch.partner_id)
                )
                partner = partner_result.scalar_one_or_none()
                if partner:
                    partner_name = partner.name

            response.append(
                BatchResponse(
                    id=batch.id,
                    name=batch.name,
                    created_at=batch.created_at,
                    expires_at=batch.expires_at,
                    note=batch.note,
                    partner_id=batch.partner_id,
                    partner_name=partner_name,
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
                    invoiced=code.invoiced,
                    invoiced_at=code.invoiced_at,
                    invoiced_to=code.invoiced_to,
                    invoice_note=code.invoice_note,
                    partner_fee_recognized=code.partner_fee_recognized,
                    partner_fee_recognized_at=code.partner_fee_recognized_at,
                )
            )

        # Resolve partner name
        partner_name = None
        if batch.partner_id:
            partner_result = await self.db.execute(
                select(User).where(User.id == batch.partner_id)
            )
            partner_user = partner_result.scalar_one_or_none()
            if partner_user:
                partner_name = partner_user.name

        return BatchWithCodesResponse(
            id=batch.id,
            name=batch.name,
            created_at=batch.created_at,
            expires_at=batch.expires_at,
            note=batch.note,
            partner_id=batch.partner_id,
            partner_name=partner_name,
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
                    invoiced=code.invoiced,
                    invoiced_at=code.invoiced_at,
                    invoiced_to=code.invoiced_to,
                    invoice_note=code.invoice_note,
                    partner_fee_recognized=code.partner_fee_recognized,
                    partner_fee_recognized_at=code.partner_fee_recognized_at,
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
            invoiced=code.invoiced,
            invoiced_at=code.invoiced_at,
            invoiced_to=code.invoiced_to,
            invoice_note=code.invoice_note,
            partner_fee_recognized=code.partner_fee_recognized,
            partner_fee_recognized_at=code.partner_fee_recognized_at,
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
        elif filters.status == "partner":
            query = query.where(User.is_partner == True)  # noqa: E712

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
                    is_partner=user.is_partner,
                    partner_type=user.partner_type,
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
            is_partner=user.is_partner,
            partner_type=user.partner_type,
            is_blocked=user.is_blocked,
            blocked_at=user.blocked_at,
            blocked_reason=user.blocked_reason,
            registration_code_id=user.registration_code_id,
            registration_code=registration_code,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
        )

    async def set_partner(
        self, user_id: str, is_partner: bool, admin_user: User
    ) -> AdminUserResponse:
        """Set or unset partner role for a user."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException(f"User {user_id} not found")

        if user.id == admin_user.id:
            raise ForbiddenException("Cannot change your own partner status")

        if user.is_admin:
            raise ForbiddenException("Cannot set partner role on an admin user")

        user.is_partner = is_partner
        if is_partner and not user.partner_type:
            user.partner_type = "billing_to_partner"
        elif not is_partner:
            user.partner_type = None
        await self.db.flush()

        return await self.get_user(user_id)

    async def set_partner_type(
        self, user_id: str, partner_type: str
    ) -> AdminUserResponse:
        """Set the billing type for a partner."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException(f"User {user_id} not found")

        if not user.is_partner:
            raise ValidationException("L'utente non e un partner")

        user.partner_type = partner_type
        await self.db.flush()

        return await self.get_user(user_id)

    async def assign_batch_to_partner(
        self, batch_id: str, partner_id: str
    ) -> BatchWithCodesResponse:
        """Assign a batch to a partner."""
        # Verify partner exists and is actually a partner
        result = await self.db.execute(select(User).where(User.id == partner_id))
        partner = result.scalar_one_or_none()
        if not partner:
            raise NotFoundException(f"User {partner_id} not found")
        if not partner.is_partner:
            raise ValidationException("L'utente selezionato non e un partner")

        # Verify batch exists
        result = await self.db.execute(
            select(RegistrationCodeBatch).where(RegistrationCodeBatch.id == batch_id)
        )
        batch = result.scalar_one_or_none()
        if not batch:
            raise NotFoundException(f"Batch {batch_id} not found")

        batch.partner_id = partner_id
        await self.db.flush()

        return await self.get_batch(batch_id)

    async def update_batch(self, batch_id: str, name: str) -> BatchWithCodesResponse:
        """Rename a batch."""
        result = await self.db.execute(
            select(RegistrationCodeBatch).where(RegistrationCodeBatch.id == batch_id)
        )
        batch = result.scalar_one_or_none()
        if not batch:
            raise NotFoundException(f"Batch {batch_id} not found")

        batch.name = name
        await self.db.flush()

        return await self.get_batch(batch_id)

    async def delete_batch(self, batch_id: str) -> None:
        """Delete a batch and all its codes (cascade)."""
        result = await self.db.execute(
            select(RegistrationCodeBatch).where(RegistrationCodeBatch.id == batch_id)
        )
        batch = result.scalar_one_or_none()
        if not batch:
            raise NotFoundException(f"Batch {batch_id} not found")

        await self.db.delete(batch)
        await self.db.flush()

    async def list_partner_batches(self, partner_id: str) -> list[PartnerBatchResponse]:
        """List batches assigned to a partner with codes and statistics."""
        result = await self.db.execute(
            select(RegistrationCodeBatch)
            .options(joinedload(RegistrationCodeBatch.codes))
            .where(RegistrationCodeBatch.partner_id == partner_id)
            .order_by(RegistrationCodeBatch.created_at.desc())
        )
        batches = result.unique().scalars().all()

        response = []
        for batch in batches:
            codes_response = []
            total = 0
            used = 0
            for code in batch.codes:
                total += 1
                used_by_name = None
                used_by_email = None
                if code.used_at:
                    used += 1
                if code.used_by_id:
                    user_result = await self.db.execute(
                        select(User).where(User.id == code.used_by_id)
                    )
                    u = user_result.scalar_one_or_none()
                    if u:
                        used_by_name = u.name
                        used_by_email = u.email

                codes_response.append(
                    PartnerCodeResponse(
                        id=code.id,
                        code=code.code,
                        created_at=code.created_at,
                        expires_at=code.expires_at,
                        used_at=code.used_at,
                        used_by_name=used_by_name,
                        used_by_email=used_by_email,
                        revoked_at=code.revoked_at,
                        invoiced=code.invoiced,
                        invoiced_to=code.invoiced_to,
                    )
                )

            response.append(
                PartnerBatchResponse(
                    id=batch.id,
                    name=batch.name,
                    created_at=batch.created_at,
                    expires_at=batch.expires_at,
                    note=batch.note,
                    total_codes=total,
                    used_codes=used,
                    available_codes=total - used,
                    codes=codes_response,
                )
            )

        return response

    async def get_partner_batch(
        self, batch_id: str, partner_id: str
    ) -> PartnerBatchResponse:
        """Get a specific batch for a partner (only if assigned to them)."""
        result = await self.db.execute(
            select(RegistrationCodeBatch)
            .options(joinedload(RegistrationCodeBatch.codes))
            .where(
                RegistrationCodeBatch.id == batch_id,
                RegistrationCodeBatch.partner_id == partner_id,
            )
        )
        batch = result.unique().scalar_one_or_none()
        if not batch:
            raise NotFoundException(f"Batch {batch_id} not found")

        codes_response = []
        total = 0
        used = 0
        for code in batch.codes:
            total += 1
            used_by_name = None
            used_by_email = None
            if code.used_at:
                used += 1
            if code.used_by_id:
                user_result = await self.db.execute(
                    select(User).where(User.id == code.used_by_id)
                )
                u = user_result.scalar_one_or_none()
                if u:
                    used_by_name = u.name
                    used_by_email = u.email

            codes_response.append(
                PartnerCodeResponse(
                    id=code.id,
                    code=code.code,
                    created_at=code.created_at,
                    expires_at=code.expires_at,
                    used_at=code.used_at,
                    used_by_name=used_by_name,
                    used_by_email=used_by_email,
                    revoked_at=code.revoked_at,
                    invoiced=code.invoiced,
                    invoiced_to=code.invoiced_to,
                )
            )

        return PartnerBatchResponse(
            id=batch.id,
            name=batch.name,
            created_at=batch.created_at,
            expires_at=batch.expires_at,
            note=batch.note,
            total_codes=total,
            used_codes=used,
            available_codes=total - used,
            codes=codes_response,
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

    # --- Billing / Report methods ---

    async def get_activated_codes_report(
        self, filters: ActivatedCodesReportFilter
    ) -> list[ActivatedCodeReportRow]:
        """Get report of activated codes with optional filters."""
        query = (
            select(
                RegistrationCode,
                RegistrationCodeBatch.name.label("batch_name"),
                RegistrationCodeBatch.partner_id.label("partner_id"),
            )
            .join(RegistrationCodeBatch, RegistrationCode.batch_id == RegistrationCodeBatch.id)
            .where(RegistrationCode.used_at.isnot(None))
        )

        if filters.partner_id == "__no_partner__":
            query = query.where(RegistrationCodeBatch.partner_id.is_(None))
        elif filters.partner_id:
            query = query.where(RegistrationCodeBatch.partner_id == filters.partner_id)

        if filters.month and filters.year:
            from calendar import monthrange

            start = datetime(filters.year, filters.month, 1)
            _, last_day = monthrange(filters.year, filters.month)
            end = datetime(filters.year, filters.month, last_day, 23, 59, 59)
            query = query.where(
                RegistrationCode.used_at >= start,
                RegistrationCode.used_at <= end,
            )
        elif filters.year:
            start = datetime(filters.year, 1, 1)
            end = datetime(filters.year, 12, 31, 23, 59, 59)
            query = query.where(
                RegistrationCode.used_at >= start,
                RegistrationCode.used_at <= end,
            )

        if filters.invoiced is not None:
            query = query.where(RegistrationCode.invoiced == filters.invoiced)

        query = query.order_by(RegistrationCode.used_at.desc())
        result = await self.db.execute(query)
        rows = result.all()

        report = []
        for row in rows:
            code = row[0]
            batch_name = row[1]
            partner_id = row[2]

            # Resolve user info
            used_by_name = None
            used_by_email = None
            if code.used_by_id:
                user_result = await self.db.execute(
                    select(User).where(User.id == code.used_by_id)
                )
                u = user_result.scalar_one_or_none()
                if u:
                    used_by_name = u.name
                    used_by_email = u.email

            # Resolve partner info
            partner_name = None
            partner_type = None
            if partner_id:
                partner_result = await self.db.execute(
                    select(User).where(User.id == partner_id)
                )
                p = partner_result.scalar_one_or_none()
                if p:
                    partner_name = p.name
                    partner_type = p.partner_type

            report.append(
                ActivatedCodeReportRow(
                    code_id=code.id,
                    code=code.code,
                    used_at=code.used_at,
                    used_by_name=used_by_name,
                    used_by_email=used_by_email,
                    batch_name=batch_name,
                    partner_id=partner_id,
                    partner_name=partner_name,
                    partner_type=partner_type,
                    invoiced=code.invoiced,
                    invoiced_at=code.invoiced_at,
                    invoiced_to=code.invoiced_to,
                    invoice_note=code.invoice_note,
                    partner_fee_recognized=code.partner_fee_recognized,
                    partner_fee_recognized_at=code.partner_fee_recognized_at,
                )
            )

        return report

    async def invoice_codes(
        self, code_ids: list[str], invoiced_to: str, invoice_note: str | None
    ) -> int:
        """Mark codes as invoiced. Returns the number of codes updated."""
        now = datetime.utcnow()
        count = 0
        for code_id in code_ids:
            result = await self.db.execute(
                select(RegistrationCode).where(RegistrationCode.id == code_id)
            )
            code = result.scalar_one_or_none()
            if not code:
                continue
            if code.invoiced:
                continue
            code.invoiced = True
            code.invoiced_at = now
            code.invoiced_to = invoiced_to
            code.invoice_note = invoice_note
            count += 1

        await self.db.flush()
        return count

    async def recognize_partner_fee(self, code_ids: list[str]) -> int:
        """Recognize partner fee for codes invoiced to client. Returns count updated."""
        now = datetime.utcnow()
        count = 0
        for code_id in code_ids:
            result = await self.db.execute(
                select(RegistrationCode).where(RegistrationCode.id == code_id)
            )
            code = result.scalar_one_or_none()
            if not code:
                continue
            if code.invoiced_to != "client":
                continue
            if code.partner_fee_recognized:
                continue
            code.partner_fee_recognized = True
            code.partner_fee_recognized_at = now
            count += 1

        await self.db.flush()
        return count

    async def get_billing_summary(
        self, partner_id: str | None, month: int | None, year: int | None
    ) -> list[PartnerBillingSummary]:
        """Get billing summary grouped by partner (includes codes without partner)."""

        def _apply_date_filter(q, month, year):
            if month and year:
                from calendar import monthrange

                start = datetime(year, month, 1)
                _, last_day = monthrange(year, month)
                end = datetime(year, month, last_day, 23, 59, 59)
                q = q.where(
                    RegistrationCode.used_at >= start,
                    RegistrationCode.used_at <= end,
                )
            elif year:
                start = datetime(year, 1, 1)
                end = datetime(year, 12, 31, 23, 59, 59)
                q = q.where(
                    RegistrationCode.used_at >= start,
                    RegistrationCode.used_at <= end,
                )
            return q

        def _compute_stats(codes):
            total = len(codes)
            invoiced_count = sum(1 for c in codes if c.invoiced)
            not_invoiced = total - invoiced_count
            to_client = sum(1 for c in codes if c.invoiced and c.invoiced_to == "client")
            to_partner = sum(1 for c in codes if c.invoiced and c.invoiced_to == "partner")
            fee_recognized = sum(1 for c in codes if c.partner_fee_recognized)
            fee_pending = sum(
                1 for c in codes
                if c.invoiced and c.invoiced_to == "client" and not c.partner_fee_recognized
            )
            return total, invoiced_count, not_invoiced, to_client, to_partner, fee_recognized, fee_pending

        # Get distinct partner_ids (including NULL) with activated codes
        query = (
            select(RegistrationCodeBatch.partner_id)
            .join(RegistrationCode, RegistrationCode.batch_id == RegistrationCodeBatch.id)
            .where(RegistrationCode.used_at.isnot(None))
        )

        if partner_id:
            query = query.where(RegistrationCodeBatch.partner_id == partner_id)

        query = _apply_date_filter(query, month, year)
        query = query.group_by(RegistrationCodeBatch.partner_id)
        result = await self.db.execute(query)
        partner_ids_rows = result.all()

        summaries = []
        for row in partner_ids_rows:
            pid = row[0]

            # Build stats query
            codes_query = (
                select(RegistrationCode)
                .join(RegistrationCodeBatch, RegistrationCode.batch_id == RegistrationCodeBatch.id)
                .where(RegistrationCode.used_at.isnot(None))
            )

            if pid is None:
                codes_query = codes_query.where(RegistrationCodeBatch.partner_id.is_(None))
            else:
                codes_query = codes_query.where(RegistrationCodeBatch.partner_id == pid)

            codes_query = _apply_date_filter(codes_query, month, year)
            codes_result = await self.db.execute(codes_query)
            codes = codes_result.scalars().all()

            total, invoiced_count, not_invoiced, to_client, to_partner, fee_recognized, fee_pending = _compute_stats(codes)

            if pid is None:
                # Codes without partner
                summaries.append(
                    PartnerBillingSummary(
                        partner_id="__no_partner__",
                        partner_name="Senza partner",
                        partner_type=None,
                        total_activated=total,
                        invoiced_count=invoiced_count,
                        not_invoiced_count=not_invoiced,
                        invoiced_to_client=to_client,
                        invoiced_to_partner=to_partner,
                        fee_recognized_count=fee_recognized,
                        fee_pending_count=fee_pending,
                    )
                )
            else:
                # Get partner info
                partner_result = await self.db.execute(
                    select(User).where(User.id == pid)
                )
                partner_user = partner_result.scalar_one_or_none()
                if not partner_user:
                    continue

                summaries.append(
                    PartnerBillingSummary(
                        partner_id=pid,
                        partner_name=partner_user.name,
                        partner_type=partner_user.partner_type,
                        total_activated=total,
                        invoiced_count=invoiced_count,
                        not_invoiced_count=not_invoiced,
                        invoiced_to_client=to_client,
                        invoiced_to_partner=to_partner,
                        fee_recognized_count=fee_recognized,
                        fee_pending_count=fee_pending,
                    )
                )

        return summaries

    async def export_activated_codes_csv(
        self, filters: ActivatedCodesReportFilter
    ) -> str:
        """Export activated codes report as CSV string."""
        rows = await self.get_activated_codes_report(filters)

        lines = [
            "Codice,Data Attivazione,Utente,Email,Batch,Partner,Tipo Partner,"
            "Fatturato,Fatturato a,Nota Fattura,Fee Riconosciuta"
        ]
        for r in rows:
            used_at_str = r.used_at.strftime("%d/%m/%Y %H:%M") if r.used_at else ""
            invoiced_str = "Si" if r.invoiced else "No"
            fee_str = "Si" if r.partner_fee_recognized else "No"
            partner_type_label = ""
            if r.partner_type == "billing_to_client":
                partner_type_label = "Fatt. Cliente"
            elif r.partner_type == "billing_to_partner":
                partner_type_label = "Fatt. Partner"

            lines.append(
                f"{r.code},{used_at_str},{r.used_by_name or '-'},"
                f"{r.used_by_email or '-'},{r.batch_name or '-'},"
                f"{r.partner_name or '-'},{partner_type_label},"
                f"{invoiced_str},{r.invoiced_to or '-'},"
                f"{r.invoice_note or '-'},{fee_str}"
            )

        return "\n".join(lines)
