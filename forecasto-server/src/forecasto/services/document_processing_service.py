"""Document upload and processing orchestration."""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, date
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from forecasto.config import settings
from forecasto.models.document_processing import (
    DocumentProcessingJob,
    LLMPricingConfig,
    UsageRecord,
)
from forecasto.models.user import User
from forecasto.services.processing_queue import processing_queue, QueueFullError

logger = logging.getLogger(__name__)

SUPPORTED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
}


class DocumentProcessingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def upload_document(
        self,
        workspace_id: str,
        file_bytes: bytes,
        filename: str,
        content_type: str,
        upload_source: str,
        user_id: str | None = None,
    ) -> DocumentProcessingJob:
        """Save file to disk, create job, enqueue for processing."""
        # Validate
        if content_type not in SUPPORTED_CONTENT_TYPES:
            raise ValueError(f"Tipo file non supportato: {content_type}")

        max_bytes = settings.document_max_size_mb * 1024 * 1024
        if len(file_bytes) > max_bytes:
            raise ValueError(f"File troppo grande: {len(file_bytes)} bytes (max {settings.document_max_size_mb}MB)")

        # SHA256
        file_hash = hashlib.sha256(file_bytes).hexdigest()

        # Save to disk
        upload_dir = Path(settings.document_upload_dir) / workspace_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_id = uuid.uuid4().hex[:12]
        safe_filename = f"{file_id}_{filename}"
        file_path = upload_dir / safe_filename
        file_path.write_bytes(file_bytes)

        # Get default model
        model = settings.document_default_model

        # Create job
        job = DocumentProcessingJob(
            workspace_id=workspace_id,
            status="queued",
            source_filename=filename,
            source_hash=file_hash,
            file_size_bytes=len(file_bytes),
            file_content_type=content_type,
            file_storage_path=str(file_path),
            upload_source=upload_source,
            uploaded_by_user_id=user_id,
            llm_model=model,
        )
        self.db.add(job)
        await self.db.flush()
        await self.db.refresh(job)

        # Enqueue (may raise QueueFullError)
        queue_position = await processing_queue.enqueue(job.id)

        return job

    async def get_job(self, workspace_id: str, job_id: str) -> DocumentProcessingJob | None:
        result = await self.db.execute(
            select(DocumentProcessingJob)
            .options(selectinload(DocumentProcessingJob.usage_record))
            .where(
                DocumentProcessingJob.id == job_id,
                DocumentProcessingJob.workspace_id == workspace_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_jobs(
        self, workspace_id: str, status: str | None = None, limit: int = 50, offset: int = 0
    ) -> tuple[list[DocumentProcessingJob], int]:
        stmt = select(DocumentProcessingJob).where(
            DocumentProcessingJob.workspace_id == workspace_id
        )
        if status:
            stmt = stmt.where(DocumentProcessingJob.status == status)
        stmt = stmt.order_by(DocumentProcessingJob.created_at.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar_one()

        result = await self.db.execute(stmt.limit(limit).offset(offset))
        return list(result.scalars().all()), total

    async def get_usage_summary(
        self, workspace_id: str, user_id: str,
        from_date: str | None = None, to_date: str | None = None,
    ) -> dict:
        """Aggregated usage stats for a workspace + user monthly quota."""
        stmt = select(UsageRecord).where(UsageRecord.workspace_id == workspace_id)
        if from_date:
            stmt = stmt.where(UsageRecord.created_at >= from_date)
        if to_date:
            stmt = stmt.where(UsageRecord.created_at <= to_date)

        result = await self.db.execute(stmt)
        records = result.scalars().all()

        # Aggregate
        total_docs = len(records)
        total_pages = sum(r.pages_processed for r in records)
        total_in = sum(r.input_tokens for r in records)
        total_out = sum(r.output_tokens for r in records)

        # By model
        by_model: dict[str, dict] = {}
        for r in records:
            m = by_model.setdefault(r.llm_model, {
                "llm_model": r.llm_model,
                "document_count": 0,
                "pages": 0,
                "input_tokens": 0,
                "output_tokens": 0,
            })
            m["document_count"] += 1
            m["pages"] += r.pages_processed
            m["input_tokens"] += r.input_tokens
            m["output_tokens"] += r.output_tokens

        # Monthly quota (user-level, cross-workspace)
        quota_info = await self.get_user_monthly_usage(user_id)

        return {
            "total_documents": total_docs,
            "total_pages": total_pages,
            "total_input_tokens": total_in,
            "total_output_tokens": total_out,
            "by_model": list(by_model.values()),
            **quota_info,
        }

    async def get_user_monthly_usage(self, user_id: str) -> dict:
        """Get user's monthly page usage and quota.

        If the user belongs to a billing profile, the quota comes from the profile
        and usage is counted across ALL users in that profile (shared quota).
        Otherwise, uses the per-user monthly_page_quota.
        """
        # Load user for quota
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            return {"monthly_page_quota": 50, "pages_this_month": 0, "pages_remaining": 50}

        month_start = date.today().replace(day=1)
        month_start_dt = datetime.combine(month_start, datetime.min.time())

        if user.billing_profile_id:
            # Shared quota from billing profile
            from forecasto.models.billing_profile import BillingProfile

            bp_result = await self.db.execute(
                select(BillingProfile).where(BillingProfile.id == user.billing_profile_id)
            )
            billing_profile = bp_result.scalar_one_or_none()
            quota = billing_profile.monthly_page_quota if billing_profile else user.monthly_page_quota

            # Count pages for ALL users in this billing profile
            profile_users_stmt = select(User.id).where(
                User.billing_profile_id == user.billing_profile_id
            )
            month_stmt = (
                select(func.coalesce(func.sum(UsageRecord.pages_processed), 0))
                .where(
                    UsageRecord.user_id.in_(profile_users_stmt),
                    UsageRecord.created_at >= month_start_dt,
                )
            )
        else:
            # Per-user quota
            quota = user.monthly_page_quota
            month_stmt = (
                select(func.coalesce(func.sum(UsageRecord.pages_processed), 0))
                .where(
                    UsageRecord.user_id == user_id,
                    UsageRecord.created_at >= month_start_dt,
                )
            )

        pages_this_month = (await self.db.execute(month_stmt)).scalar_one()
        remaining = max(0, quota - pages_this_month)

        return {
            "monthly_page_quota": quota,
            "pages_this_month": pages_this_month,
            "pages_remaining": remaining,
        }

    async def list_usage_records(
        self, workspace_id: str, limit: int = 50, offset: int = 0
    ) -> tuple[list[UsageRecord], int]:
        stmt = select(UsageRecord).where(
            UsageRecord.workspace_id == workspace_id
        ).order_by(UsageRecord.created_at.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar_one()

        result = await self.db.execute(stmt.limit(limit).offset(offset))
        return list(result.scalars().all()), total

    # --- Admin: LLM Pricing ---

    @staticmethod
    async def list_pricing(db: AsyncSession) -> list[LLMPricingConfig]:
        result = await db.execute(
            select(LLMPricingConfig).order_by(LLMPricingConfig.model_name)
        )
        return list(result.scalars().all())

    @staticmethod
    async def update_pricing(db: AsyncSession, config_id: str, **kwargs) -> LLMPricingConfig | None:
        result = await db.execute(
            select(LLMPricingConfig).where(LLMPricingConfig.id == config_id)
        )
        config = result.scalar_one_or_none()
        if not config:
            return None
        for k, v in kwargs.items():
            if v is not None and hasattr(config, k):
                setattr(config, k, v)
        await db.flush()
        await db.refresh(config)
        return config
