"""VAT (IVA) calculation service — Italian VAT periodic settlement.

Refactored to work with VatRegistry instead of manual workspace selection.
Calculates per-area with global credit carry-forward (actual → orders → prospect → budget).
Auto-creates IVA_{vat_number} workspace for settlement records.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.models.record import Record
from forecasto.models.user import User
from forecasto.models.vat_registry import VatBalance, VatRegistry
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.vat import (
    VatCalculationRequest,
    VatCalculationResponse,
    VatPeriodResult,
)
from forecasto.services.record_service import RecordService
from forecasto.schemas.record import RecordCreate
from forecasto.exceptions import NotFoundException, ForbiddenException

logger = logging.getLogger(__name__)

# ── Italian quarterly VAT payment dates ──────────────────────────────
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
AREA_PRIORITY = ["actual", "orders", "prospect", "budget"]


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
        """Calculate VAT for each period per area and optionally create records."""

        # 1. Resolve registry
        registry = await self._get_registry(req.vat_registry_id, user)

        # 2. Find all workspaces linked to this registry
        workspace_ids = await self._get_workspace_ids(registry)
        if not workspace_ids:
            return VatCalculationResponse(
                periods=[], total_debito=Decimal("0"), total_credito=Decimal("0"),
                total_net=Decimal("0"), records_created=0, dry_run=dry_run,
            )

        # 3. Find latest balance → determines start_month
        latest_balance = await self._get_latest_balance(registry.id)
        if latest_balance:
            # Start from the month AFTER the balance
            start_month = self._next_month(latest_balance.month)
            initial_credit = max(latest_balance.amount, Decimal("0"))
            initial_debit = min(latest_balance.amount, Decimal("0"))
        else:
            start_month = None  # will be determined from earliest record
            initial_credit = Decimal("0")
            initial_debit = Decimal("0")

        # 4. Determine end_month
        end_month = req.end_month or date.today().strftime("%Y-%m")

        # 5. Fetch records (use end_month only if it's after start_month)
        fetch_end = end_month
        if start_month and start_month > end_month:
            fetch_end = None  # don't limit — will determine from data
        records = await self._fetch_records(workspace_ids, start_month, fetch_end)

        if not records and not latest_balance:
            return VatCalculationResponse(
                periods=[], total_debito=Decimal("0"), total_credito=Decimal("0"),
                total_net=Decimal("0"), records_created=0, dry_run=dry_run,
            )

        # Determine start_month from earliest record if no balance
        if start_month is None and records:
            earliest = min(r.date_cashflow for r in records)
            start_month = earliest.strftime("%Y-%m")

        # Extend end_month to cover all fetched records
        if records:
            latest_record_month = max(r.date_cashflow for r in records).strftime("%Y-%m")
            if latest_record_month > end_month:
                end_month = latest_record_month

        if start_month is None:
            return VatCalculationResponse(
                periods=[], total_debito=Decimal("0"), total_credito=Decimal("0"),
                total_net=Decimal("0"), records_created=0, dry_run=dry_run,
            )

        # 6. Enumerate periods
        periods = self._enumerate_periods(start_month, end_month, req.period_type)

        # 7. Group records by (area, period)
        grouped = self._group_by_area_and_period(records, req.period_type)

        # 8. Calculate per-area with global credit carry-forward
        results = self._calculate_per_area(
            periods, grouped, req.period_type, req.use_summer_extension,
            initial_credit, initial_debit, latest_balance,
        )

        # 9. Fix credit dates
        self._fix_credit_dates(results)

        total_debito = sum((r.iva_debito for r in results), Decimal("0"))
        total_credito = sum((r.iva_credito for r in results), Decimal("0"))
        total_net = sum((r.net for r in results), Decimal("0"))

        # 10. Create records in IVA workspace
        target_workspace_id = None
        records_created = 0
        if not dry_run:
            target_ws = await self._get_or_create_iva_workspace(registry, user)
            target_workspace_id = target_ws.id
            records_created = await self._create_records(results, target_ws.id, user)
        else:
            # Show what the target would be
            existing = await self._find_iva_workspace(registry, user)
            target_workspace_id = existing.id if existing else None

        return VatCalculationResponse(
            periods=results,
            total_debito=total_debito.quantize(TWO_PLACES),
            total_credito=total_credito.quantize(TWO_PLACES),
            total_net=total_net.quantize(TWO_PLACES),
            records_created=records_created,
            target_workspace_id=target_workspace_id,
            dry_run=dry_run,
        )

    # ── Cashflow simulation (no record creation) ────────────────────

    async def calculate_for_cashflow(
        self,
        registry: VatRegistry,
        workspace_ids: list[str],
        from_date: date,
        to_date: date,
        period_type: str = "monthly",
        use_summer_extension: bool = True,
        area_stage: list[str] | None = None,
    ) -> list[VatPeriodResult]:
        """Calculate VAT series for cashflow overlay. Always dry-run, no record creation."""

        # Find latest balance before from_date
        latest_balance = await self._get_balance_before(registry.id, from_date.strftime("%Y-%m"))

        if latest_balance:
            start_month = self._next_month(latest_balance.month)
            initial_credit = max(latest_balance.amount, Decimal("0"))
            initial_debit = min(latest_balance.amount, Decimal("0"))
        else:
            start_month = from_date.strftime("%Y-%m")
            initial_credit = Decimal("0")
            initial_debit = Decimal("0")

        end_month = to_date.strftime("%Y-%m")

        # Extend to cover records beyond the view range
        fetch_end = None if start_month > end_month else end_month
        records = await self._fetch_records(workspace_ids, start_month, fetch_end)

        # Apply area_stage filter if provided
        if area_stage:
            allowed = set()
            for pair in area_stage:
                parts = pair.split(":")
                if len(parts) == 2:
                    allowed.add((parts[0], parts[1]))
            if allowed:
                records = [r for r in records if (r.area, str(r.stage)) in allowed]

        if not records and not latest_balance:
            return []

        if records:
            latest_record_month = max(r.date_cashflow for r in records).strftime("%Y-%m")
            if latest_record_month > end_month:
                end_month = latest_record_month

        if start_month > end_month:
            return []

        periods = self._enumerate_periods(start_month, end_month, period_type)
        grouped = self._group_by_area_and_period(records, period_type)

        results = self._calculate_per_area(
            periods, grouped, period_type, use_summer_extension,
            initial_credit, initial_debit, latest_balance,
        )
        self._fix_credit_dates(results)
        return results

    async def _get_balance_before(self, registry_id: str, month: str) -> VatBalance | None:
        """Get the latest balance on or before the given month."""
        result = await self.db.execute(
            select(VatBalance)
            .where(
                VatBalance.vat_registry_id == registry_id,
                VatBalance.month <= month,
            )
            .order_by(VatBalance.month.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    # ── Registry resolution ──────────────────────────────────────────

    async def _get_registry(self, registry_id: str, user: User) -> VatRegistry:
        result = await self.db.execute(
            select(VatRegistry).where(VatRegistry.id == registry_id)
        )
        registry = result.scalar_one_or_none()
        if not registry:
            raise NotFoundException(f"VAT registry {registry_id} not found")
        if registry.owner_id != user.id:
            raise ForbiddenException("Not the owner of this VAT registry")
        return registry

    async def _get_workspace_ids(self, registry: VatRegistry) -> list[str]:
        result = await self.db.execute(
            select(Workspace.id).where(Workspace.vat_registry_id == registry.id)
        )
        return [row[0] for row in result.fetchall()]

    async def _get_latest_balance(self, registry_id: str) -> VatBalance | None:
        result = await self.db.execute(
            select(VatBalance)
            .where(VatBalance.vat_registry_id == registry_id)
            .order_by(VatBalance.month.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    # ── IVA workspace auto-creation ──────────────────────────────────

    async def _find_iva_workspace(self, registry: VatRegistry, user: User) -> Workspace | None:
        ws_name = f"IVA_{registry.vat_number}"
        result = await self.db.execute(
            select(Workspace).where(
                Workspace.owner_id == user.id,
                Workspace.name == ws_name,
            )
        )
        return result.scalar_one_or_none()

    async def _get_or_create_iva_workspace(self, registry: VatRegistry, user: User) -> Workspace:
        ws = await self._find_iva_workspace(registry, user)
        if ws:
            return ws

        ws_name = f"IVA_{registry.vat_number}"
        ws = Workspace(
            name=ws_name,
            description=f"Liquidazione IVA per P.IVA {registry.vat_number}",
            owner_id=user.id,
            settings={"auto_created": True, "vat_registry_id": registry.id},
        )
        self.db.add(ws)
        await self.db.flush()

        member = WorkspaceMember(
            workspace_id=ws.id,
            user_id=user.id,
            role="owner",
        )
        self.db.add(member)
        await self.db.flush()

        return ws

    # ── Period enumeration ────────────────────────────────────────────

    @staticmethod
    def _next_month(month_str: str) -> str:
        y, m = map(int, month_str.split("-"))
        m += 1
        if m > 12:
            m = 1
            y += 1
        return f"{y:04d}-{m:02d}"

    def _enumerate_periods(self, start_month: str, end_month: str, period_type: str) -> list[str]:
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
        self, workspace_ids: list[str], start_month: str | None, end_month: str | None,
    ) -> list[Record]:
        conditions = [
            Record.workspace_id.in_(workspace_ids),
            Record.deleted_at.is_(None),
        ]

        if end_month:
            ey, em = map(int, end_month.split("-"))
            if em == 12:
                end_date = date(ey + 1, 1, 1) - timedelta(days=1)
            else:
                end_date = date(ey, em + 1, 1) - timedelta(days=1)
            conditions.append(Record.date_cashflow <= end_date)

        if start_month:
            sy, sm = map(int, start_month.split("-"))
            start_date = date(sy, sm, 1)
            conditions.append(Record.date_cashflow >= start_date)

        stmt = select(Record).where(*conditions)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ── Grouping ──────────────────────────────────────────────────────

    def _get_record_period(self, rec: Record, period_type: str) -> str:
        if rec.vat_month:
            month_str = rec.vat_month
        else:
            month_str = rec.date_cashflow.strftime("%Y-%m")

        if period_type == "monthly":
            return month_str
        else:
            y, m = map(int, month_str.split("-"))
            q = (m - 1) // 3 + 1
            return f"{y:04d}-Q{q}"

    def _group_by_area_and_period(
        self, records: list[Record], period_type: str,
    ) -> dict[str, dict[str, list[Record]]]:
        """Group records by area → period → list[Record]."""
        grouped: dict[str, dict[str, list[Record]]] = defaultdict(lambda: defaultdict(list))
        for rec in records:
            key = self._get_record_period(rec, period_type)
            grouped[rec.area][key].append(rec)
        return grouped

    # ── VAT computation ───────────────────────────────────────────────

    def _compute_period_vat(self, records: list[Record]) -> tuple[Decimal, Decimal]:
        iva_debito = Decimal("0")
        iva_credito = Decimal("0")

        for rec in records:
            vat_amount = abs(rec.total - rec.amount)
            if vat_amount == 0:
                continue

            if rec.amount > 0:
                iva_debito += vat_amount
            else:
                deduction_pct = rec.vat_deduction if rec.vat_deduction is not None else Decimal("100")
                iva_credito += (vat_amount * deduction_pct / Decimal("100")).quantize(
                    TWO_PLACES, rounding=ROUND_HALF_UP
                )

        return iva_debito, iva_credito

    def _calculate_per_area(
        self,
        periods: list[str],
        grouped: dict[str, dict[str, list[Record]]],
        period_type: str,
        use_summer_extension: bool,
        initial_credit: Decimal,
        initial_debit: Decimal,
        latest_balance: VatBalance | None,
    ) -> list[VatPeriodResult]:
        """Calculate per period per area with global credit carry-forward.

        Credit carry-forward is global and compensates in priority order:
        actual → orders → prospect → budget.
        """
        results: list[VatPeriodResult] = []
        carried_credit = initial_credit  # global across all areas

        # If initial balance is debit, create a settlement record for it
        if initial_debit < 0 and latest_balance:
            balance_month = latest_balance.month
            payment_date = self._get_payment_date_for_month(balance_month, period_type, use_summer_extension)
            review = payment_date - timedelta(days=7)
            results.append(VatPeriodResult(
                period=balance_month,
                area="actual",  # debit balance goes to actual
                iva_debito=abs(initial_debit).quantize(TWO_PLACES),
                iva_credito=Decimal("0"),
                credit_carried=Decimal("0"),
                net=abs(initial_debit).quantize(TWO_PLACES),
                date_cashflow=payment_date,
                review_date=review,
            ))

        for period_key in periods:
            payment_date = self._get_payment_date(period_key, period_type, use_summer_extension)
            review = payment_date - timedelta(days=7)

            # Calculate per area in priority order, applying global credit
            for area in AREA_PRIORITY:
                area_records = grouped.get(area, {}).get(period_key, [])
                if not area_records and carried_credit == 0:
                    continue

                iva_debito, iva_credito = self._compute_period_vat(area_records)

                if iva_debito == 0 and iva_credito == 0 and carried_credit == 0:
                    continue

                net = iva_debito - iva_credito

                # Apply global carried credit to this area
                if net > 0 and carried_credit > 0:
                    if carried_credit >= net:
                        carried_credit -= net
                        net = Decimal("0")
                    else:
                        net -= carried_credit
                        carried_credit = Decimal("0")
                elif net < 0:
                    # This area generates credit — add to global carry
                    carried_credit += abs(net)
                    net = Decimal("0")

                # Only emit a result if there's something meaningful
                if iva_debito > 0 or iva_credito > 0 or net != 0:
                    results.append(VatPeriodResult(
                        period=period_key,
                        area=area,
                        iva_debito=iva_debito.quantize(TWO_PLACES),
                        iva_credito=iva_credito.quantize(TWO_PLACES),
                        credit_carried=carried_credit.quantize(TWO_PLACES),
                        net=net.quantize(TWO_PLACES),
                        date_cashflow=payment_date,
                        review_date=review,
                    ))

        return results

    # ── Payment dates ─────────────────────────────────────────────────

    def _get_payment_date(self, period_key: str, period_type: str, use_summer_extension: bool) -> date:
        if period_type == "monthly":
            y, m = map(int, period_key.split("-"))
            m += 1
            if m > 12:
                m = 1
                y += 1
            return date(y, m, 16)
        else:
            parts = period_key.split("-Q")
            y = int(parts[0])
            q = int(parts[1])
            deadlines = _QUARTERLY_DEADLINES_SUMMER_EXT if use_summer_extension else _QUARTERLY_DEADLINES_STANDARD
            month, year_offset = deadlines[q]
            return date(y + year_offset, month, 16)

    def _get_payment_date_for_month(self, month_str: str, period_type: str, use_summer_extension: bool) -> date:
        """Get payment date for a given month (used for balance-based records)."""
        if period_type == "monthly":
            return self._get_payment_date(month_str, "monthly", use_summer_extension)
        else:
            y, m = map(int, month_str.split("-"))
            q = (m - 1) // 3 + 1
            return self._get_payment_date(f"{y:04d}-Q{q}", "quarterly", use_summer_extension)

    # ── Credit date fixup ─────────────────────────────────────────────

    def _fix_credit_dates(self, results: list[VatPeriodResult]) -> None:
        for i, r in enumerate(results):
            if r.net < 0:
                for j in range(i + 1, len(results)):
                    if results[j].net > 0:
                        r.date_cashflow = results[j].date_cashflow
                        r.review_date = r.date_cashflow - timedelta(days=7)
                        break

    # ── Record creation ───────────────────────────────────────────────

    async def _create_records(
        self,
        results: list[VatPeriodResult],
        target_workspace_id: str,
        user: User,
    ) -> int:
        record_service = RecordService(self.db)
        created = 0

        for r in results:
            if r.net == 0:
                continue

            # Debito (net > 0) → uscita (amount negativo)
            # Credito (net < 0) → entrata (amount positivo)
            signed_amount = -r.net if r.net > 0 else abs(r.net)

            data = RecordCreate(
                area=r.area,
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
                workspace_id=target_workspace_id,
                data=data,
                user=user,
            )
            r.record_id = record.id
            created += 1

        await self.db.commit()
        return created
