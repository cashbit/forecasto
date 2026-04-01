"""Inbox service — manages document queue from Forecasto Agent."""

from __future__ import annotations

import hashlib
import logging
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import ForbiddenException, NotFoundException
from forecasto.models.inbox import InboxItem
from forecasto.models.user import User
from forecasto.models.workspace import ApiKey, WorkspaceMember
from forecasto.schemas.inbox import InboxItemCreate, InboxItemUpdate, RecordSuggestion
from forecasto.schemas.record import RecordCreate
from forecasto.services.record_service import RecordService

logger = logging.getLogger(__name__)


class InboxService:
    """Service for inbox operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # -------------------------------------------------------------------------
    # Agent-facing: create item via API key
    # -------------------------------------------------------------------------

    async def create_item(
        self,
        workspace_id: str,
        data: InboxItemCreate,
    ) -> InboxItem:
        """Create a new inbox item (called by the agent)."""
        item = InboxItem(
            workspace_id=workspace_id,
            status="pending",
            source_path=data.source_path,
            source_filename=data.source_filename,
            source_hash=data.source_hash,
            source_deleted=False,
            llm_provider=data.llm_provider,
            llm_model=data.llm_model,
            agent_version=data.agent_version,
            extracted_data=[s.model_dump(mode="json") for s in data.extracted_data],
            confirmed_record_ids=[],
            document_type=data.document_type,
            reconciliation_matches=data.reconciliation_matches or [],
        )
        self.db.add(item)
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def mark_source_deleted(
        self,
        workspace_id: str,
        source_hash: str,
    ) -> list[InboxItem]:
        """Mark all pending items for a given file hash as source-deleted."""
        result = await self.db.execute(
            select(InboxItem).where(
                InboxItem.workspace_id == workspace_id,
                InboxItem.source_hash == source_hash,
                InboxItem.status == "pending",
                InboxItem.deleted_at.is_(None),
            )
        )
        items = result.scalars().all()
        for item in items:
            item.source_deleted = True
        await self.db.flush()
        return list(items)

    # -------------------------------------------------------------------------
    # User-facing: list, get, update, confirm, reject, delete
    # -------------------------------------------------------------------------

    async def list_items(
        self,
        workspace_id: str,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[InboxItem], int]:
        """List inbox items for a workspace, pending first."""
        stmt = select(InboxItem).where(
            InboxItem.workspace_id == workspace_id,
            InboxItem.deleted_at.is_(None),
        )
        if status:
            stmt = stmt.where(InboxItem.status == status)

        # pending first, then by created_at desc
        stmt = stmt.order_by(
            InboxItem.status.asc(),   # "confirmed"/"pending"/"rejected" — pending sorts last alphabetically
            InboxItem.created_at.desc(),
        )

        count_stmt = select(func.count()).select_from(
            select(InboxItem).where(
                InboxItem.workspace_id == workspace_id,
                InboxItem.deleted_at.is_(None),
            ).subquery()
        )
        if status:
            count_stmt = select(func.count()).select_from(
                select(InboxItem).where(
                    InboxItem.workspace_id == workspace_id,
                    InboxItem.deleted_at.is_(None),
                    InboxItem.status == status,
                ).subquery()
            )

        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar_one()

        stmt = stmt.limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        items = result.scalars().all()
        return list(items), total

    async def get_item(
        self,
        workspace_id: str,
        item_id: str,
    ) -> InboxItem:
        result = await self.db.execute(
            select(InboxItem).where(
                InboxItem.id == item_id,
                InboxItem.workspace_id == workspace_id,
                InboxItem.deleted_at.is_(None),
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise NotFoundException(f"Inbox item {item_id} not found")
        return item

    async def count_pending(self, workspace_id: str) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(
                select(InboxItem).where(
                    InboxItem.workspace_id == workspace_id,
                    InboxItem.status == "pending",
                    InboxItem.deleted_at.is_(None),
                ).subquery()
            )
        )
        return result.scalar_one()

    async def update_item(
        self,
        workspace_id: str,
        item_id: str,
        data: InboxItemUpdate,
    ) -> InboxItem:
        item = await self.get_item(workspace_id, item_id)
        if item.status != "pending":
            raise ForbiddenException("Solo gli item in stato 'pending' possono essere modificati")
        if data.extracted_data is not None:
            item.extracted_data = [s.model_dump(mode="json") for s in data.extracted_data]
        if data.reconciliation_matches is not None:
            item.reconciliation_matches = data.reconciliation_matches
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def confirm_item(
        self,
        workspace_id: str,
        item_id: str,
        user: User,
        member: WorkspaceMember,
    ) -> InboxItem:
        """Confirm item: convert extracted_data to real records."""
        item = await self.get_item(workspace_id, item_id)
        if item.status != "pending":
            raise ForbiddenException("Solo gli item in stato 'pending' possono essere confermati")

        record_service = RecordService(self.db)
        record_ids: list[str] = []

        for suggestion_dict in item.extracted_data:
            suggestion = RecordSuggestion(**suggestion_dict)
            # Parse date strings to date objects
            try:
                date_offer = date.fromisoformat(suggestion.date_offer) if suggestion.date_offer else date.today()
                date_cashflow = date.fromisoformat(suggestion.date_cashflow) if suggestion.date_cashflow else date.today()
            except ValueError:
                date_offer = date.today()
                date_cashflow = date.today()

            record_data = RecordCreate(
                area=suggestion.area,
                type=suggestion.type,
                account=suggestion.account,
                reference=suggestion.reference,
                note=suggestion.note,
                date_offer=date_offer,
                date_cashflow=date_cashflow,
                amount=suggestion.amount,
                vat=suggestion.vat,
                vat_deduction=suggestion.vat_deduction,
                vat_month=suggestion.vat_month,
                total=suggestion.total,
                stage=suggestion.stage,
                transaction_id=suggestion.transaction_id,
                bank_account_id=suggestion.bank_account_id,
                project_code=suggestion.project_code,
                withholding_rate=suggestion.withholding_rate,
                classification=suggestion.classification,
            )
            record = await record_service.create_record(
                workspace_id=workspace_id,
                data=record_data,
                user=user,
                member=member,
            )
            record_ids.append(record.id)

        item.status = "confirmed"
        item.confirmed_record_ids = record_ids

        # Mark matched records as paid for wire_transfer / bank_statement
        if item.document_type in ("wire_transfer", "bank_statement") and item.reconciliation_matches:
            from forecasto.models.record import Record
            for match in item.reconciliation_matches:
                if not match.get("confirmed"):
                    continue
                rec_result = await self.db.execute(
                    select(Record).where(
                        Record.id == match["record_id"],
                        Record.workspace_id == workspace_id,
                    )
                )
                rec = rec_result.scalar_one_or_none()
                if rec:
                    rec.stage = "1"
            await self.db.flush()

        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def reject_item(
        self,
        workspace_id: str,
        item_id: str,
    ) -> InboxItem:
        item = await self.get_item(workspace_id, item_id)
        if item.status != "pending":
            raise ForbiddenException("Solo gli item in stato 'pending' possono essere rifiutati")
        item.status = "rejected"
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def delete_item(
        self,
        workspace_id: str,
        item_id: str,
    ) -> None:
        item = await self.get_item(workspace_id, item_id)
        item.deleted_at = datetime.utcnow()
        await self.db.flush()

    # -------------------------------------------------------------------------
    # API key auth helper
    # -------------------------------------------------------------------------

    @staticmethod
    def hash_api_key(raw_key: str) -> str:
        """Hash a raw API key for lookup."""
        return hashlib.sha256(raw_key.encode()).hexdigest()

    async def get_workspace_id_from_api_key(self, raw_key: str) -> str:
        """Validate API key and return its workspace_id."""
        key_hash = self.hash_api_key(raw_key)
        result = await self.db.execute(
            select(ApiKey).where(
                ApiKey.key_hash == key_hash,
                ApiKey.revoked_at.is_(None),
            )
        )
        api_key = result.scalar_one_or_none()
        if not api_key:
            raise ForbiddenException("API key non valida o revocata")
        if api_key.expires_at and api_key.expires_at < datetime.utcnow():
            raise ForbiddenException("API key scaduta")
        # Update last_used_at
        api_key.last_used_at = datetime.utcnow()
        await self.db.flush()
        return api_key.workspace_id

    async def get_user_from_agent_token(self, raw_token: str):
        """Validate an agent token and return the User."""
        from forecasto.models.agent_token import AgentToken
        from forecasto.models.user import User as UserModel

        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        result = await self.db.execute(
            select(AgentToken).where(
                AgentToken.token_hash == token_hash,
                AgentToken.revoked_at.is_(None),
            )
        )
        token = result.scalar_one_or_none()
        if not token:
            raise ForbiddenException("Agent token non valido o revocato")
        token.last_used_at = datetime.utcnow()
        await self.db.flush()

        user_result = await self.db.execute(
            select(UserModel).where(UserModel.id == token.user_id)
        )
        return user_result.scalar_one_or_none()

    async def verify_agent_workspace_access(self, user_id: str, workspace_id: str) -> bool:
        """Check that the user is owner or member of the workspace."""
        from forecasto.models.workspace import Workspace

        # Check if owner
        owner_result = await self.db.execute(
            select(Workspace).where(
                Workspace.id == workspace_id,
                Workspace.owner_id == user_id,
            )
        )
        if owner_result.scalar_one_or_none():
            return True

        # Check if member
        member_result = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.workspace_id == workspace_id,
            )
        )
        return member_result.scalar_one_or_none() is not None

    async def create_agent_token(self, user_id: str, name: str) -> tuple[str, "AgentToken"]:
        """Create a new agent token. Returns (raw_token, token_obj)."""
        import os
        from forecasto.models.agent_token import AgentToken

        raw_token = "at_" + os.urandom(20).hex()
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        token_obj = AgentToken(
            user_id=user_id,
            name=name,
            token_hash=token_hash,
        )
        self.db.add(token_obj)
        await self.db.flush()
        await self.db.refresh(token_obj)
        return raw_token, token_obj

    async def list_agent_tokens(self, user_id: str) -> list:
        """List active (non-revoked) agent tokens for a user."""
        from forecasto.models.agent_token import AgentToken

        result = await self.db.execute(
            select(AgentToken)
            .where(AgentToken.user_id == user_id)
            .where(AgentToken.revoked_at.is_(None))
            .order_by(AgentToken.created_at.desc())
        )
        return result.scalars().all()

    async def revoke_agent_token(self, user_id: str, token_id: str) -> bool:
        """Revoke an agent token by ID. Returns True if found and revoked."""
        from forecasto.models.agent_token import AgentToken

        result = await self.db.execute(
            select(AgentToken)
            .where(AgentToken.id == token_id)
            .where(AgentToken.user_id == user_id)
            .where(AgentToken.revoked_at.is_(None))
        )
        token_obj = result.scalar_one_or_none()
        if not token_obj:
            return False
        token_obj.revoked_at = datetime.utcnow()
        await self.db.flush()
        return True

    async def mark_records_paid(
        self,
        workspace_id: str,
        record_ids: list[str],
        payment_date: str | None = None,
    ) -> list[str]:
        """Mark a list of records as paid (stage='1'). Returns list of updated IDs."""
        from forecasto.models.record import Record
        from datetime import date as date_cls

        updated = []
        for rid in record_ids:
            result = await self.db.execute(
                select(Record).where(
                    Record.id == rid,
                    Record.workspace_id == workspace_id,
                )
            )
            rec = result.scalar_one_or_none()
            if rec:
                rec.stage = "1"
                if payment_date:
                    try:
                        rec.date_cashflow = date_cls.fromisoformat(payment_date)
                    except ValueError:
                        pass
                updated.append(rid)
        if updated:
            await self.db.flush()
        return updated

    async def find_payment_matches(
        self,
        workspace_id: str,
        amount: Decimal,
        reference_hint: str,
        limit: int = 5,
    ) -> list[dict]:
        """Find records that could match a payment document (for reconciliation).

        Searches unpaid records (stage != '1') by total amount closeness
        and reference text similarity.
        """
        from forecasto.models.record import Record

        # Exact or near amount match (within 1 cent)
        result = await self.db.execute(
            select(Record).where(
                Record.workspace_id == workspace_id,
                Record.deleted_at.is_(None),
                Record.stage != "1",
                func.abs(Record.total - amount) < Decimal("0.02"),
            ).order_by(Record.date_cashflow.asc()).limit(limit)
        )
        exact_matches = result.scalars().all()

        # Also fuzzy reference match (case-insensitive substring)
        hint_words = [w.strip() for w in reference_hint.split() if len(w.strip()) > 2]
        fuzzy_matches = []
        if hint_words:
            # Try each significant word from the reference hint
            for word in hint_words[:3]:
                result = await self.db.execute(
                    select(Record).where(
                        Record.workspace_id == workspace_id,
                        Record.deleted_at.is_(None),
                        Record.stage != "1",
                        or_(
                            Record.reference.ilike(f"%{word}%"),
                            Record.transaction_id.ilike(f"%{word}%"),
                        ),
                    ).limit(limit)
                )
                fuzzy_matches.extend(result.scalars().all())

        # Merge, deduplicate, score
        seen = set()
        candidates = []
        for rec in exact_matches + fuzzy_matches:
            if rec.id in seen:
                continue
            seen.add(rec.id)
            is_exact_amount = abs(float(rec.total) - float(amount)) < 0.02
            ref_match = any(w.lower() in (rec.reference or "").lower() for w in hint_words[:3])
            score = (0.7 if is_exact_amount else 0.0) + (0.3 if ref_match else 0.0)
            if score > 0:
                candidates.append({
                    "record_id": rec.id,
                    "reference": rec.reference,
                    "account": rec.account,
                    "total": float(rec.total),
                    "date_cashflow": rec.date_cashflow.isoformat() if rec.date_cashflow else None,
                    "date_offer": rec.date_offer.isoformat() if rec.date_offer else None,
                    "stage": rec.stage,
                    "match_score": round(score, 2),
                    "match_reason": (
                        "importo e riferimento corrispondenti" if is_exact_amount and ref_match
                        else "importo corrispondente" if is_exact_amount
                        else "riferimento corrispondente"
                    ),
                })

        return sorted(candidates, key=lambda x: x["match_score"], reverse=True)[:limit]
