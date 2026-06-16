"""Agente-zero service: incremental analysis + highlights aggregation.

Staleness model (note: Record.updated_at has onupdate=utcnow, so any write bumps
it). We therefore:
  - select candidates with `agent_analyzed_at IS NULL OR updated_at > agent_analyzed_at`
  - on write, set `updated_at = agent_analyzed_at = now` explicitly, so the just-
    processed row is no longer `> analyzed_at` (strict). A genuine later user edit
    bumps updated_at strictly past analyzed_at again → re-selected.
  - the source-hash decides whether the LLM actually runs (relevant fields changed)
    vs. a no-op bump (an unrelated field changed).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.config import settings
from forecasto.models.agent_zero import AgentZeroRun
from forecasto.models.record import Record
from forecasto.models.workspace import Workspace
from forecasto.services.agent_zero.analyzer import analyze_records, extract_zero_text
from forecasto.services.agent_zero.hashing import compute_source_hash
from forecasto.services.llm.pricing import cost_eur

logger = logging.getLogger(__name__)


def _has_zero_tag(record: Record) -> bool:
    """A record is in scope only if its note contains an @zero tag with text after it."""
    return bool(extract_zero_text(record.note))


class AgentZeroService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Per-workspace opt-in ──────────────────────────────────

    async def is_enabled(self, workspace_id: str) -> bool:
        """Whether the workspace opted into Agente-zero (settings switch, off by default)."""
        ws_settings = (
            await self.db.execute(
                select(Workspace.settings).where(Workspace.id == workspace_id)
            )
        ).scalar_one_or_none()
        return bool((ws_settings or {}).get("agent_zero_enabled"))

    async def enabled_workspace_ids(self) -> list[str]:
        rows = (await self.db.execute(select(Workspace.id, Workspace.settings))).all()
        return [wid for wid, ws_settings in rows if (ws_settings or {}).get("agent_zero_enabled")]

    # ── Analysis ──────────────────────────────────────────────

    async def _candidate_records(
        self, workspace_ids: list[str], *, bypass_delay: bool, limit: int
    ) -> list[Record]:
        now = datetime.utcnow()
        conditions = [
            Record.workspace_id.in_(workspace_ids),
            Record.deleted_at.is_(None),
            Record.stage == "0",
            or_(
                Record.agent_analyzed_at.is_(None),
                Record.updated_at > Record.agent_analyzed_at,
            ),
        ]
        if not bypass_delay:
            settle_cutoff = now - timedelta(seconds=settings.agent_zero_delay_seconds)
            conditions.append(Record.updated_at <= settle_cutoff)

        stmt = (
            select(Record)
            .where(and_(*conditions))
            .order_by(Record.updated_at.asc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def analyze_stale(
        self,
        workspace_id: str | None = None,
        *,
        bypass_delay: bool = False,
        trigger: str = "scheduler",
    ) -> dict:
        """Analyze stale records (one workspace or all). Commits its own work.

        Returns a small stats dict.
        """
        if not settings.agent_zero_enabled:
            return {"analyzed": 0, "llm_calls": 0, "skipped": 0, "enabled": False}

        # Per-workspace opt-in gate.
        if workspace_id is not None:
            if not await self.is_enabled(workspace_id):
                return {"analyzed": 0, "llm_calls": 0, "skipped": 0, "enabled": False}
            workspace_ids = [workspace_id]
        else:
            workspace_ids = await self.enabled_workspace_ids()
            if not workspace_ids:
                return {"analyzed": 0, "llm_calls": 0, "skipped": 0, "enabled": False}

        records = await self._candidate_records(
            workspace_ids, bypass_delay=bypass_delay, limit=settings.agent_zero_max_per_pass
        )
        if not records:
            return {"analyzed": 0, "llm_calls": 0, "skipped": 0, "enabled": True}

        now = datetime.utcnow()
        to_analyze: list[Record] = []
        skipped = 0

        for record in records:
            current_hash = compute_source_hash(record)
            if record.agent_source_hash == current_hash:
                # Relevant fields unchanged → just settle the timestamp (no LLM).
                record.agent_analyzed_at = now
                record.updated_at = now
                skipped += 1
            elif _has_zero_tag(record):
                to_analyze.append(record)
            else:
                # Changed but no @zero tag → clear stale insights.
                record.agent_insights = {}
                record.agent_source_hash = current_hash
                record.agent_analyzed_at = now
                record.updated_at = now

        llm_calls = 0
        analyzed = 0

        # Group by workspace so each AgentZeroRun (billing) maps to one workspace.
        by_workspace: dict[str, list[Record]] = {}
        for r in to_analyze:
            by_workspace.setdefault(r.workspace_id, []).append(r)

        batch_size = max(1, settings.agent_zero_batch_size)
        for ws_id, ws_records in by_workspace.items():
            ws_input = ws_output = 0
            ws_model = settings.agent_zero_model
            ws_error: str | None = None
            started = datetime.utcnow()
            for i in range(0, len(ws_records), batch_size):
                chunk = ws_records[i : i + batch_size]
                try:
                    insights_by_id, usage = await analyze_records(chunk)
                    llm_calls += 1
                    ws_input += usage.get("input_tokens", 0)
                    ws_output += usage.get("output_tokens", 0)
                    ws_model = usage.get("model", ws_model)
                except Exception as exc:  # noqa: BLE001
                    logger.exception("Agente-zero analysis batch failed: %s", exc)
                    ws_error = str(exc)[:500]
                    continue

                stamp = datetime.utcnow()
                for record in chunk:
                    extracted = insights_by_id.get(record.id, {})
                    record.agent_insights = {
                        "reminders": extracted.get("reminders", []),
                        "criticalities": extracted.get("criticalities", []),
                    }
                    record.agent_source_hash = compute_source_hash(record)
                    record.agent_analyzed_at = stamp
                    record.updated_at = stamp
                    analyzed += 1

            self.db.add(
                AgentZeroRun(
                    workspace_id=ws_id,
                    status="failed" if (ws_error and ws_input == 0) else "completed",
                    trigger=trigger,
                    llm_model=ws_model,
                    input_tokens=ws_input,
                    output_tokens=ws_output,
                    total_cost_eur=cost_eur(ws_model, ws_input, ws_output),
                    records_analyzed=len(ws_records),
                    error_message=ws_error,
                    billing_month=started.strftime("%Y-%m"),
                    started_at=started,
                    completed_at=datetime.utcnow(),
                )
            )

        await self.db.commit()
        return {"analyzed": analyzed, "llm_calls": llm_calls, "skipped": skipped, "enabled": True}

    # ── Highlights aggregation ────────────────────────────────

    async def get_highlights(self, workspace_id: str) -> dict:
        """Flatten cached per-record insights for one workspace into items."""
        if not await self.is_enabled(workspace_id):
            return {"items": [], "last_analyzed_at": None, "stale_count": 0, "enabled": False}

        stmt = select(Record).where(
            Record.workspace_id == workspace_id,
            Record.deleted_at.is_(None),
            Record.stage == "0",
        )
        result = await self.db.execute(stmt)
        records = list(result.scalars().all())

        items: list[dict] = []
        last_analyzed_at: datetime | None = None
        stale_count = 0

        for record in records:
            if record.agent_analyzed_at and (
                last_analyzed_at is None or record.agent_analyzed_at > last_analyzed_at
            ):
                last_analyzed_at = record.agent_analyzed_at

            # Stale = an @zero record whose relevant fields changed since last analysis.
            if _has_zero_tag(record) and (
                record.agent_source_hash != compute_source_hash(record)
            ):
                stale_count += 1

            insights = record.agent_insights or {}
            if not insights:
                continue

            base = {
                "record_id": record.id,
                "workspace_id": record.workspace_id,
                "owner": record.owner,
                "review_date": record.review_date.isoformat() if record.review_date else None,
                "date_cashflow": record.date_cashflow.isoformat() if record.date_cashflow else None,
                "account": record.account,
                "reference": record.reference,
                "area": record.area,
                "amount": str(record.amount),
            }
            for rem in insights.get("reminders", []):
                items.append(
                    {**base, "kind": "reminder", "text": rem.get("text", ""), "due_date": rem.get("due_date")}
                )
            for crit in insights.get("criticalities", []):
                items.append({**base, "kind": "criticality", "text": crit.get("text", "")})

        return {
            "items": items,
            "last_analyzed_at": last_analyzed_at.isoformat() if last_analyzed_at else None,
            "stale_count": stale_count,
            "enabled": True,
        }

    # ── Usage aggregation (for the Consumo AI page) ───────────

    async def usage_summary(self, workspace_id: str) -> dict:
        """Aggregate AgentZeroRun rows for a workspace (current month + per-month)."""
        from sqlalchemy import func

        current_month = datetime.utcnow().strftime("%Y-%m")
        result = await self.db.execute(
            select(
                AgentZeroRun.billing_month,
                func.sum(AgentZeroRun.input_tokens),
                func.sum(AgentZeroRun.output_tokens),
                func.sum(AgentZeroRun.total_cost_eur),
                func.count(),
            )
            .where(AgentZeroRun.workspace_id == workspace_id)
            .group_by(AgentZeroRun.billing_month)
            .order_by(AgentZeroRun.billing_month.desc())
            .limit(12)
        )
        by_month = [
            {
                "month": row[0],
                "input_tokens": int(row[1] or 0),
                "output_tokens": int(row[2] or 0),
                "cost_eur": round(float(row[3] or 0), 4),
                "runs": int(row[4] or 0),
            }
            for row in result.all()
        ]
        current = next((m for m in by_month if m["month"] == current_month), None)
        return {
            "runs_this_month": current["runs"] if current else 0,
            "input_tokens_this_month": current["input_tokens"] if current else 0,
            "output_tokens_this_month": current["output_tokens"] if current else 0,
            "cost_eur_this_month": current["cost_eur"] if current else 0.0,
            "by_month": by_month,
        }
