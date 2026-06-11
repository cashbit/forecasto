"""Numerator service — per-workspace consecutive document numbering.

Fully algorithmic two-phase issuance (reserve → confirm) with a single
embedded pending reservation per numerator, plus a single-phase immediate
mode (`confirm_ttl_seconds == 0`). Expiry is lazy; concurrency is handled with
guarded conditional UPDATEs + rowcount checks (SQLite serializes writers).

The service takes an `AsyncSession` and never commits (the router commits).
"""

from __future__ import annotations

import logging
import math
import re
import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import ConflictException, NotFoundException, ValidationException
from forecasto.models.numerator import Numerator, NumeratorEntry
from forecasto.schemas.numerator import (
    ConfirmResult,
    NumeratorCreate,
    NumeratorUpdate,
    PeekResult,
    ReserveResult,
)

logger = logging.getLogger(__name__)

_KEY_RE = re.compile(r"[^a-z0-9_-]+")

# Max attempts for the optimistic immediate-issue loop before giving up.
_IMMEDIATE_MAX_ATTEMPTS = 6


def _normalize_key(value: str) -> str:
    return _KEY_RE.sub("-", (value or "").strip().lower()).strip("-")


def compute_period_key(reset_policy: str, now: datetime) -> str:
    """The reset-period bucket for `now`: '' (never) / 'YYYY' / 'YYYY-MM'."""
    if reset_policy == "yearly":
        return f"{now.year:04d}"
    if reset_policy == "monthly":
        return f"{now.year:04d}-{now.month:02d}"
    return ""  # never


def render_number(num: Numerator, value: int, now: datetime) -> str:
    """Render the structured format. Year/month tokens come from `now` (the
    issuance moment), independent of the reset policy."""
    parts: list[str] = []
    if num.prefix:
        parts.append(num.prefix)
    if num.include_year:
        parts.append(f"{now.year:04d}")
    if num.include_month:
        parts.append(f"{now.month:02d}")
    parts.append(f"{value:0{max(num.padding, 1)}d}")
    rendered = (num.separator or "").join(parts)
    if num.suffix:
        rendered += num.suffix
    return rendered


class NumeratorService:
    """Service for numerators and their issued-number history."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # -------------------------------------------------------------------------
    # CRUD
    # -------------------------------------------------------------------------

    async def create_numerator(
        self,
        workspace_id: str,
        data: NumeratorCreate,
        user_id: str | None = None,
    ) -> Numerator:
        key = _normalize_key(data.key)
        if not key:
            raise ValidationException("La chiave del numeratore non è valida")
        existing = await self.db.execute(
            select(Numerator.id).where(
                Numerator.workspace_id == workspace_id,
                Numerator.key == key,
                Numerator.deleted_at.is_(None),
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise ConflictException(f"Esiste già un numeratore con chiave '{key}'")

        numerator = Numerator(
            workspace_id=workspace_id,
            key=key,
            name=data.name,
            reset_policy=data.reset_policy,
            start_number=data.start_number,
            prefix=data.prefix,
            suffix=data.suffix,
            separator=data.separator,
            padding=data.padding,
            include_year=data.include_year,
            include_month=data.include_month,
            confirm_ttl_seconds=data.confirm_ttl_seconds,
            last_value=None,
            period_key=None,
            created_by=user_id,
        )
        self.db.add(numerator)
        await self.db.flush()
        await self.db.refresh(numerator)
        return numerator

    async def list_numerators(self, workspace_id: str) -> list[Numerator]:
        result = await self.db.execute(
            select(Numerator)
            .where(
                Numerator.workspace_id == workspace_id,
                Numerator.deleted_at.is_(None),
            )
            .order_by(Numerator.name.asc())
        )
        return list(result.scalars().all())

    async def get_numerator(self, workspace_id: str, numerator_id: str) -> Numerator:
        result = await self.db.execute(
            select(Numerator).where(
                Numerator.id == numerator_id,
                Numerator.workspace_id == workspace_id,
                Numerator.deleted_at.is_(None),
            )
        )
        numerator = result.scalar_one_or_none()
        if not numerator:
            raise NotFoundException(f"Numeratore {numerator_id} non trovato")
        return numerator

    async def update_numerator(
        self,
        workspace_id: str,
        numerator_id: str,
        data: NumeratorUpdate,
    ) -> Numerator:
        numerator = await self.get_numerator(workspace_id, numerator_id)
        if data.name is not None:
            numerator.name = data.name
        if data.reset_policy is not None:
            numerator.reset_policy = data.reset_policy
        if data.start_number is not None:
            # Don't let start_number drop to or below an already-issued value.
            if numerator.last_value is not None and data.start_number <= numerator.last_value:
                raise ValidationException(
                    "Il numero di partenza deve essere maggiore dell'ultimo numero emesso "
                    f"({numerator.last_value})"
                )
            numerator.start_number = data.start_number
        if data.prefix is not None:
            numerator.prefix = data.prefix
        if data.suffix is not None:
            numerator.suffix = data.suffix
        if data.separator is not None:
            numerator.separator = data.separator
        if data.padding is not None:
            numerator.padding = data.padding
        if data.include_year is not None:
            numerator.include_year = data.include_year
        if data.include_month is not None:
            numerator.include_month = data.include_month
        if data.confirm_ttl_seconds is not None:
            numerator.confirm_ttl_seconds = data.confirm_ttl_seconds
        await self.db.flush()
        await self.db.refresh(numerator)
        return numerator

    async def delete_numerator(self, workspace_id: str, numerator_id: str) -> None:
        numerator = await self.get_numerator(workspace_id, numerator_id)
        numerator.deleted_at = datetime.utcnow()
        await self.db.flush()

    async def list_entries(
        self,
        workspace_id: str,
        numerator_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[NumeratorEntry], int]:
        await self.get_numerator(workspace_id, numerator_id)
        base = select(NumeratorEntry).where(NumeratorEntry.numerator_id == numerator_id)
        total = await self.db.scalar(select(func.count()).select_from(base.subquery()))
        result = await self.db.execute(
            base.order_by(NumeratorEntry.issued_at.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars().all()), int(total or 0)

    # -------------------------------------------------------------------------
    # Candidate computation
    # -------------------------------------------------------------------------

    def _candidate(self, numerator: Numerator, current_period: str) -> int:
        """Next value to issue, considering a period reset."""
        if current_period != (numerator.period_key or "") or numerator.last_value is None:
            return numerator.start_number
        return numerator.last_value + 1

    # -------------------------------------------------------------------------
    # Reserve / immediate issue
    # -------------------------------------------------------------------------

    async def reserve(
        self,
        workspace_id: str,
        numerator_id: str,
        reserved_by: str | None,
    ) -> ReserveResult:
        now = datetime.utcnow()
        numerator = await self.get_numerator(workspace_id, numerator_id)

        # Single-phase: issue immediately.
        if numerator.confirm_ttl_seconds <= 0:
            return await self._issue_immediately(numerator, reserved_by, now)

        current_period = compute_period_key(numerator.reset_policy, now)

        # Existing active pending reservation?
        if numerator.pending_token is not None and numerator.pending_expires_at and numerator.pending_expires_at > now:
            if numerator.pending_reserved_by == reserved_by:
                # Idempotent: same caller gets their reservation back (no TTL renewal).
                return ReserveResult(
                    status="reserved",
                    numerator_id=numerator.id,
                    key=numerator.key,
                    value=numerator.pending_value,
                    formatted=render_number(numerator, numerator.pending_value, now),
                    period_key=numerator.pending_period_key or "",
                    token=numerator.pending_token,
                    expires_at=numerator.pending_expires_at,
                )
            wait = max(1, math.ceil((numerator.pending_expires_at - now).total_seconds()))
            return ReserveResult(
                status="pending",
                numerator_id=numerator.id,
                key=numerator.key,
                retry_after_seconds=wait,
            )

        # Claim the reservation atomically (overwrites an expired/absent pending).
        candidate = self._candidate(numerator, current_period)
        token = str(uuid.uuid4())
        expires_at = now + timedelta(seconds=numerator.confirm_ttl_seconds)
        stmt = (
            update(Numerator)
            .where(
                Numerator.id == numerator.id,
                Numerator.deleted_at.is_(None),
                (Numerator.pending_token.is_(None)) | (Numerator.pending_expires_at <= now),
            )
            .values(
                pending_token=token,
                pending_value=candidate,
                pending_period_key=current_period,
                pending_reserved_by=reserved_by,
                pending_expires_at=expires_at,
                updated_at=now,
            )
        )
        result = await self.db.execute(stmt)
        if result.rowcount == 0:
            # Lost the race — someone claimed in between. Re-read and report.
            await self.db.refresh(numerator)
            if (
                numerator.pending_token is not None
                and numerator.pending_expires_at
                and numerator.pending_expires_at > now
            ):
                if numerator.pending_reserved_by == reserved_by:
                    return ReserveResult(
                        status="reserved",
                        numerator_id=numerator.id,
                        key=numerator.key,
                        value=numerator.pending_value,
                        formatted=render_number(numerator, numerator.pending_value, now),
                        period_key=numerator.pending_period_key or "",
                        token=numerator.pending_token,
                        expires_at=numerator.pending_expires_at,
                    )
                wait = max(1, math.ceil((numerator.pending_expires_at - now).total_seconds()))
                return ReserveResult(
                    status="pending",
                    numerator_id=numerator.id,
                    key=numerator.key,
                    retry_after_seconds=wait,
                )
            # No active pending after refresh — surface a transient conflict.
            raise ConflictException("Impossibile riservare il numero, riprova")

        await self.db.refresh(numerator)
        return ReserveResult(
            status="reserved",
            numerator_id=numerator.id,
            key=numerator.key,
            value=candidate,
            formatted=render_number(numerator, candidate, now),
            period_key=current_period,
            token=token,
            expires_at=expires_at,
        )

    async def _issue_immediately(
        self,
        numerator: Numerator,
        issued_by: str | None,
        now: datetime,
    ) -> ReserveResult:
        """Single-call consume, atomic via optimistic concurrency + retry."""
        for _ in range(_IMMEDIATE_MAX_ATTEMPTS):
            current_period = compute_period_key(numerator.reset_policy, now)
            observed_last = numerator.last_value if numerator.last_value is not None else -1
            observed_period = numerator.period_key or ""
            candidate = self._candidate(numerator, current_period)

            stmt = (
                update(Numerator)
                .where(
                    Numerator.id == numerator.id,
                    Numerator.deleted_at.is_(None),
                    func.coalesce(Numerator.last_value, -1) == observed_last,
                    func.coalesce(Numerator.period_key, "") == observed_period,
                )
                .values(
                    last_value=candidate,
                    period_key=current_period,
                    pending_token=None,
                    pending_value=None,
                    pending_period_key=None,
                    pending_reserved_by=None,
                    pending_expires_at=None,
                    updated_at=now,
                )
            )
            result = await self.db.execute(stmt)
            if result.rowcount == 1:
                formatted = render_number(numerator, candidate, now)
                self._write_entry(numerator, candidate, formatted, current_period, issued_by, now, None)
                await self.db.flush()
                return ReserveResult(
                    status="issued",
                    numerator_id=numerator.id,
                    key=numerator.key,
                    value=candidate,
                    formatted=formatted,
                    period_key=current_period,
                    issued_at=now,
                )
            # Contention: refresh and retry.
            await self.db.refresh(numerator)
        raise ConflictException("Numeratore troppo conteso, riprova")

    # -------------------------------------------------------------------------
    # Confirm / cancel
    # -------------------------------------------------------------------------

    async def confirm(
        self,
        workspace_id: str,
        numerator_id: str,
        token: str,
        issued_by: str | None,
    ) -> ConfirmResult:
        now = datetime.utcnow()
        numerator = await self.get_numerator(workspace_id, numerator_id)

        if numerator.pending_token is None or numerator.pending_token != token:
            raise ConflictException(
                "Prenotazione non trovata o già elaborata",
                details={"code": "reservation_not_found_or_already_processed"},
            )
        if not numerator.pending_expires_at or numerator.pending_expires_at <= now:
            await self._clear_pending(numerator.id, now)
            raise ConflictException(
                "Prenotazione scaduta, richiedi un nuovo numero",
                details={"code": "reservation_expired"},
            )

        current_period = compute_period_key(numerator.reset_policy, now)
        if current_period != (numerator.pending_period_key or ""):
            await self._clear_pending(numerator.id, now)
            raise ConflictException(
                "Cambio di periodo: richiedi un nuovo numero",
                details={"code": "period_boundary_crossed_reserve_again"},
            )

        pending_value = numerator.pending_value
        pending_period = numerator.pending_period_key or ""

        stmt = (
            update(Numerator)
            .where(
                Numerator.id == numerator.id,
                Numerator.pending_token == token,
                Numerator.pending_expires_at > now,
            )
            .values(
                last_value=pending_value,
                period_key=pending_period,
                pending_token=None,
                pending_value=None,
                pending_period_key=None,
                pending_reserved_by=None,
                pending_expires_at=None,
                updated_at=now,
            )
        )
        result = await self.db.execute(stmt)
        if result.rowcount == 0:
            raise ConflictException(
                "Prenotazione non trovata o già elaborata",
                details={"code": "reservation_not_found_or_already_processed"},
            )

        formatted = render_number(numerator, pending_value, now)
        self._write_entry(numerator, pending_value, formatted, pending_period, issued_by, now, token)
        await self.db.flush()
        return ConfirmResult(
            numerator_id=numerator.id,
            key=numerator.key,
            value=pending_value,
            formatted=formatted,
            period_key=pending_period,
            issued_at=now,
        )

    async def cancel(self, workspace_id: str, numerator_id: str, token: str) -> bool:
        now = datetime.utcnow()
        numerator = await self.get_numerator(workspace_id, numerator_id)
        stmt = (
            update(Numerator)
            .where(Numerator.id == numerator.id, Numerator.pending_token == token)
            .values(
                pending_token=None,
                pending_value=None,
                pending_period_key=None,
                pending_reserved_by=None,
                pending_expires_at=None,
                updated_at=now,
            )
        )
        result = await self.db.execute(stmt)
        await self.db.flush()
        return result.rowcount == 1

    async def peek(self, workspace_id: str, numerator_id: str) -> PeekResult:
        now = datetime.utcnow()
        numerator = await self.get_numerator(workspace_id, numerator_id)
        current_period = compute_period_key(numerator.reset_policy, now)
        candidate = self._candidate(numerator, current_period)
        return PeekResult(
            numerator_id=numerator.id,
            key=numerator.key,
            value=candidate,
            formatted=render_number(numerator, candidate, now),
            period_key=current_period,
        )

    # -------------------------------------------------------------------------
    # Internals
    # -------------------------------------------------------------------------

    def _write_entry(
        self,
        numerator: Numerator,
        value: int,
        formatted: str,
        period_key: str,
        issued_by: str | None,
        now: datetime,
        token: str | None,
    ) -> None:
        entry = NumeratorEntry(
            numerator_id=numerator.id,
            workspace_id=numerator.workspace_id,
            value=value,
            formatted=formatted,
            period_key=period_key,
            issued_by=issued_by,
            issued_at=now,
            reservation_token=token,
        )
        self.db.add(entry)

    async def _clear_pending(self, numerator_id: str, now: datetime) -> None:
        await self.db.execute(
            update(Numerator)
            .where(Numerator.id == numerator_id)
            .values(
                pending_token=None,
                pending_value=None,
                pending_period_key=None,
                pending_reserved_by=None,
                pending_expires_at=None,
                updated_at=now,
            )
        )
