"""Withholding tax (ritenuta d'acconto) simulation service.

Calculates projected F24 payments for withholding taxes withheld on
outgoing invoices (amount < 0) with a withholding_rate set.

Payment rule: withholding is due on the 16th of the month following
the payment date (date_cashflow).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.models.record import Record

TWO_PLACES = Decimal("0.01")


class WithholdingService:
    """Simulate withholding tax (ritenuta d'acconto) payments for cashflow."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def simulate(
        self,
        workspace_ids: list[str],
        from_date: date,
        to_date: date,
        area_stage: list[str] | None = None,
    ) -> list[dict]:
        """Return projected withholding payments grouped by month.

        Each entry has: payment_date, amount (positive = uscita), area breakdown.
        """
        records = await self._fetch_records(workspace_ids, from_date, to_date)

        # Apply area_stage filter
        if area_stage:
            allowed = set()
            for pair in area_stage:
                parts = pair.split(":")
                if len(parts) == 2:
                    allowed.add((parts[0], parts[1]))
            if allowed:
                records = [r for r in records if (r.area, str(r.stage)) in allowed]

        # Group by payment month (16th of month after date_cashflow)
        # bucket key: (payment_date, area)
        buckets: dict[tuple[date, str], Decimal] = defaultdict(lambda: Decimal("0"))

        for rec in records:
            wh_amount = (
                abs(rec.amount) * rec.withholding_rate / Decimal("100")
            ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
            payment_date = self._payment_date(rec.date_cashflow)
            buckets[(payment_date, rec.area)] += wh_amount

        # Build response entries
        entries = []
        for (pdate, area), amount in sorted(buckets.items()):
            entries.append({
                "date": pdate.isoformat(),
                "period": pdate.strftime("%Y-%m"),
                "area": area,
                "amount": float(amount),
            })

        return entries

    @staticmethod
    def _payment_date(cashflow_date: date) -> date:
        """Withholding is due on the 16th of the month after payment."""
        y, m = cashflow_date.year, cashflow_date.month
        if m == 12:
            return date(y + 1, 1, 16)
        return date(y, m + 1, 16)

    async def _fetch_records(
        self,
        workspace_ids: list[str],
        from_date: date,
        to_date: date,
    ) -> list[Record]:
        """Fetch outgoing records with withholding_rate set."""
        stmt = (
            select(Record)
            .where(
                Record.workspace_id.in_(workspace_ids),
                Record.deleted_at.is_(None),
                Record.amount < 0,  # outgoing only
                Record.withholding_rate.isnot(None),
                Record.withholding_rate > 0,
                Record.date_cashflow >= from_date,
                Record.date_cashflow <= to_date,
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
