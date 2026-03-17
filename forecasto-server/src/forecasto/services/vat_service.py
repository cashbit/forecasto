"""VAT (IVA) calculation service — Italian VAT periodic settlement."""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.models.record import Record
from forecasto.models.user import User
from forecasto.models.workspace import WorkspaceMember
from forecasto.schemas.vat import (
    VatCalculationRequest,
    VatCalculationResponse,
    VatPeriodResult,
)
from forecasto.services.record_service import RecordService
from forecasto.schemas.record import RecordCreate

logger = logging.getLogger(__name__)

# ── Italian quarterly VAT payment dates ──────────────────────────────
# Quarter → (payment_month, payment_year_offset)
_QUARTERLY_DEADLINES_STANDARD = {
    1: (5, 0),   # Q1 (Jan-Mar) → May 16
    2: (8, 0),   # Q2 (Apr-Jun) → Aug 16
    3: (11, 0),  # Q3 (Jul-Sep) → Nov 16
    4: (3, 1),   # Q4 (Oct-Dec) → Mar 16 next year
}

_QUARTERLY_DEADLINES_SUMMER_EXT = {
    1: (5, 0),   # Q1 → May 16
    2: (9, 0),   # Q2 → Sep 16 (proroga estiva)
    3: (11, 0),  # Q3 → Nov 16
    4: (3, 1),   # Q4 → Mar 16 next year
}

TWO_PLACES = Decimal("0.01")


class VatService:
    """Calculate Italian periodic VAT (IVA) and create settlement records."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Public API ────────────────────────────────────────────────────

    async def calculate(
        self,
        req: VatCalculationRequest,
        user: User,
        *,
        dry_run: bool = False,
    ) -> VatCalculationResponse:
        """Calculate VAT for each period and optionally create records."""

        periods = self._enumerate_periods(req.start_month, req.end_month, req.period_type)

        # Fetch all relevant records from source workspaces
        records = await self._fetch_records(req.source_workspace_ids, req.start_month, req.end_month)

        # Group records by period
        grouped = self._group_by_period(records, req.period_type)

        # Calculate per-period
        results: list[VatPeriodResult] = []
        carried_credit = Decimal("0")

        for period_key in periods:
            period_records = grouped.get(period_key, [])
            iva_debito, iva_credito = self._compute_period_vat(period_records)

            net = iva_debito - iva_credito - carried_credit

            if net < 0:
                # Credit exceeds debit — carry forward
                carried_credit = abs(net)
                net_for_record = net
            else:
                carried_credit = Decimal("0")
                net_for_record = net

            payment_date = self._get_payment_date(period_key, req.period_type, req.use_summer_extension)
            review = payment_date - timedelta(days=7)

            results.append(VatPeriodResult(
                period=period_key,
                iva_debito=iva_debito.quantize(TWO_PLACES),
                iva_credito=iva_credito.quantize(TWO_PLACES),
                credit_carried=carried_credit.quantize(TWO_PLACES),
                net=net_for_record.quantize(TWO_PLACES),
                date_cashflow=payment_date,
                review_date=review,
            ))

        # Fix credit periods: set their date_cashflow to the first subsequent debit date
        self._fix_credit_dates(results)

        total_debito = sum(r.iva_debito for r in results)
        total_credito = sum(r.iva_credito for r in results)
        total_net = sum(r.net for r in results)

        records_created = 0
        if not dry_run:
            records_created = await self._create_records(results, req, user)

        return VatCalculationResponse(
            periods=results,
            total_debito=total_debito.quantize(TWO_PLACES),
            total_credito=total_credito.quantize(TWO_PLACES),
            total_net=total_net.quantize(TWO_PLACES),
            records_created=records_created,
            dry_run=dry_run,
        )

    # ── Period enumeration ────────────────────────────────────────────

    def _enumerate_periods(self, start_month: str, end_month: str, period_type: str) -> list[str]:
        """Return ordered list of period keys between start and end."""
        sy, sm = map(int, start_month.split("-"))
        ey, em = map(int, end_month.split("-"))

        if period_type == "monthly":
            periods = []
            y, m = sy, sm
            while (y, m) <= (ey, em):
                periods.append(f"{y:04d}-{m:02d}")
                m += 1
                if m > 12:
                    m = 1
                    y += 1
            return periods
        else:
            # Quarterly
            periods = []
            sq = (sm - 1) // 3 + 1
            eq = (em - 1) // 3 + 1
            y, q = sy, sq
            while (y, q) <= (ey, eq):
                periods.append(f"{y:04d}-Q{q}")
                q += 1
                if q > 4:
                    q = 1
                    y += 1
            return periods

    # ── Data fetching ─────────────────────────────────────────────────

    async def _fetch_records(
        self, workspace_ids: list[str], start_month: str, end_month: str,
    ) -> list[Record]:
        """Fetch non-deleted records in the date range from given workspaces."""
        sy, sm = map(int, start_month.split("-"))
        ey, em = map(int, end_month.split("-"))
        start_date = date(sy, sm, 1)
        # End date: last day of end_month
        if em == 12:
            end_date = date(ey + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(ey, em + 1, 1) - timedelta(days=1)

        stmt = (
            select(Record)
            .where(
                Record.workspace_id.in_(workspace_ids),
                Record.deleted_at.is_(None),
                Record.date_cashflow >= start_date,
                Record.date_cashflow <= end_date,
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ── Grouping ──────────────────────────────────────────────────────

    def _get_record_period(self, rec: Record, period_type: str) -> str:
        """Determine which period a record belongs to."""
        if rec.vat_month:
            month_str = rec.vat_month  # "YYYY-MM"
        else:
            month_str = rec.date_cashflow.strftime("%Y-%m")

        if period_type == "monthly":
            return month_str
        else:
            y, m = map(int, month_str.split("-"))
            q = (m - 1) // 3 + 1
            return f"{y:04d}-Q{q}"

    def _group_by_period(
        self, records: list[Record], period_type: str,
    ) -> dict[str, list[Record]]:
        grouped: dict[str, list[Record]] = defaultdict(list)
        for rec in records:
            key = self._get_record_period(rec, period_type)
            grouped[key].append(rec)
        return grouped

    # ── VAT computation ───────────────────────────────────────────────

    def _compute_period_vat(
        self, records: list[Record],
    ) -> tuple[Decimal, Decimal]:
        """Return (iva_debito, iva_credito) for a period.

        - IVA a debito: from positive records (sales / income)
          = |total - amount| for each record with amount > 0
        - IVA a credito: from negative records (purchases / expense)
          = |total - amount| * vat_deduction / 100 for each record with amount < 0
        """
        iva_debito = Decimal("0")
        iva_credito = Decimal("0")

        for rec in records:
            vat_amount = abs(rec.total - rec.amount)
            if vat_amount == 0:
                continue

            if rec.amount > 0:
                # Sales — IVA a debito
                iva_debito += vat_amount
            else:
                # Purchases — IVA a credito (deductible portion)
                deduction_pct = rec.vat_deduction if rec.vat_deduction is not None else Decimal("100")
                iva_credito += (vat_amount * deduction_pct / Decimal("100")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

        return iva_debito, iva_credito

    # ── Payment dates ─────────────────────────────────────────────────

    def _get_payment_date(
        self, period_key: str, period_type: str, use_summer_extension: bool,
    ) -> date:
        """Compute the VAT payment deadline for a period."""
        if period_type == "monthly":
            y, m = map(int, period_key.split("-"))
            # Monthly: 16th of next month
            m += 1
            if m > 12:
                m = 1
                y += 1
            return date(y, m, 16)
        else:
            # Quarterly
            parts = period_key.split("-Q")
            y = int(parts[0])
            q = int(parts[1])
            deadlines = _QUARTERLY_DEADLINES_SUMMER_EXT if use_summer_extension else _QUARTERLY_DEADLINES_STANDARD
            month, year_offset = deadlines[q]
            return date(y + year_offset, month, 16)

    # ── Credit date fixup ─────────────────────────────────────────────

    def _fix_credit_dates(self, results: list[VatPeriodResult]) -> None:
        """For credit periods (net < 0), set date_cashflow to the first
        subsequent debit period's payment date so the credit offsets the debit."""
        for i, r in enumerate(results):
            if r.net < 0:
                # Look forward for the first debit period
                found = False
                for j in range(i + 1, len(results)):
                    if results[j].net > 0:
                        r.date_cashflow = results[j].date_cashflow
                        r.review_date = r.date_cashflow - timedelta(days=7)
                        found = True
                        break
                if not found:
                    # No subsequent debit — keep the original payment date
                    pass

    # ── Record creation ───────────────────────────────────────────────

    async def _create_records(
        self,
        results: list[VatPeriodResult],
        req: VatCalculationRequest,
        user: User,
    ) -> int:
        """Create IVA settlement records in the target workspace."""
        record_service = RecordService(self.db)
        created = 0

        for r in results:
            if r.net == 0:
                continue

            # Debito (net > 0) → uscita (amount negativo)
            # Credito (net < 0) → entrata (amount positivo)
            if r.net > 0:
                signed_amount = -r.net  # payment outflow
            else:
                signed_amount = abs(r.net)  # credit inflow

            data = RecordCreate(
                area=req.target_area,
                type="standard",
                account="Erario",
                reference="IVA DA VERSARE",
                date_cashflow=r.date_cashflow,
                date_offer=r.date_cashflow,
                amount=signed_amount,
                vat=Decimal("0"),
                vat_deduction=Decimal("100"),
                vat_month=r.period[:7] if "-Q" not in r.period else None,
                total=signed_amount,
                stage="0",
                transaction_id=r.period,
                owner="ADMIN",
                nextaction="VERIFICARE",
                review_date=r.review_date,
            )

            record = await record_service.create_record(
                workspace_id=req.target_workspace_id,
                data=data,
                user=user,
            )
            r.record_id = record.id
            created += 1

        await self.db.commit()
        return created
