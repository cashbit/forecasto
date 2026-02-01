"""Cashflow service for financial projections."""

from __future__ import annotations


from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.models.bank_account import BankAccount, BankAccountBalance
from forecasto.models.record import Record
from forecasto.schemas.cashflow import (
    AccountBalance,
    BalancePoint,
    CashflowEntry,
    CashflowRecordSummary,
    CashflowRequest,
    CashflowResponse,
    CashflowSummary,
    InitialBalance,
)

class CashflowService:
    """Service for cashflow calculations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def calculate_cashflow(
        self,
        workspace_id: str,
        params: CashflowRequest,
    ) -> CashflowResponse:
        """Calculate cashflow projection for a workspace."""
        # Get initial balances
        initial_balance = await self._get_initial_balance(
            workspace_id, params.from_date, params.bank_account_id
        )

        # Get records in date range
        records = await self._get_records(workspace_id, params)

        # Group records by date
        records_by_date = defaultdict(list)
        for record in records:
            records_by_date[record.date_cashflow].append(record)

        # Calculate daily cashflow
        cashflow_entries = []
        running_balance = initial_balance.total
        min_balance = BalancePoint(date=params.from_date, amount=running_balance)
        max_balance = BalancePoint(date=params.from_date, amount=running_balance)
        credit_breaches = []

        total_inflows = Decimal("0")
        total_outflows = Decimal("0")

        # Generate date range
        current_date = params.from_date
        while current_date <= params.to_date:
            day_records = records_by_date.get(current_date, [])

            # Calculate day totals using algebraic sum
            inflows = sum(
                Decimal(str(r.total)) for r in day_records if r.total > 0
            )
            outflows = sum(
                Decimal(str(r.total)) for r in day_records if r.total < 0
            )
            net = inflows + outflows  # outflows are already negative

            running_balance += net
            total_inflows += inflows
            total_outflows += outflows

            # Track min/max
            if running_balance < min_balance.amount:
                min_balance = BalancePoint(date=current_date, amount=running_balance)
            if running_balance > max_balance.amount:
                max_balance = BalancePoint(date=current_date, amount=running_balance)

            # Check credit limit breach
            total_credit_limit = sum(
                Decimal(str(ab.credit_limit)) for ab in initial_balance.by_account.values()
            )
            if running_balance < -total_credit_limit:
                credit_breaches.append(BalancePoint(date=current_date, amount=running_balance))

            # Only add entry if there are records or if grouping includes it
            if day_records or params.group_by == "day":
                entry = CashflowEntry(
                    date=current_date,
                    inflows=inflows,
                    outflows=outflows,
                    net=net,
                    running_balance=running_balance,
                    records=[
                        CashflowRecordSummary(
                            id=r.id,
                            reference=r.reference,
                            amount=r.total,
                            area=r.area,
                        )
                        for r in day_records
                    ] if day_records else None,
                )
                cashflow_entries.append(entry)

            current_date += timedelta(days=1)

        # Aggregate by group_by if needed
        if params.group_by in ("week", "month"):
            cashflow_entries = self._aggregate_entries(cashflow_entries, params.group_by)

        # Build summary
        summary = CashflowSummary(
            total_inflows=total_inflows,
            total_outflows=total_outflows,
            net_cashflow=total_inflows + total_outflows,
            final_balance=running_balance,
            min_balance=min_balance,
            max_balance=max_balance,
            credit_limit_breaches=credit_breaches,
        )

        return CashflowResponse(
            parameters=params,
            initial_balance=initial_balance,
            cashflow=cashflow_entries,
            summary=summary,
        )

    async def _get_initial_balance(
        self,
        workspace_id: str,
        start_date: date,
        bank_account_id: str | None = None,
    ) -> InitialBalance:
        """Get initial balance for cashflow calculation."""
        query = select(BankAccount).where(
            BankAccount.workspace_id == workspace_id,
            BankAccount.is_active == True,  # noqa: E712
        )

        if bank_account_id:
            query = query.where(BankAccount.id == bank_account_id)

        result = await self.db.execute(query)
        accounts = list(result.scalars().all())

        by_account = {}
        total = Decimal("0")

        for account in accounts:
            # Get balance closest to start date
            result = await self.db.execute(
                select(BankAccountBalance)
                .where(
                    BankAccountBalance.bank_account_id == account.id,
                    BankAccountBalance.balance_date <= start_date,
                )
                .order_by(BankAccountBalance.balance_date.desc())
                .limit(1)
            )
            balance_record = result.scalar_one_or_none()

            balance = balance_record.balance if balance_record else Decimal("0")
            total += balance

            by_account[account.id] = AccountBalance(
                name=account.name,
                balance=balance,
                credit_limit=account.credit_limit,
            )

        return InitialBalance(
            date=start_date,
            total=total,
            by_account=by_account,
        )

    async def _get_records(
        self,
        workspace_id: str,
        params: CashflowRequest,
    ) -> list[Record]:
        """Get records for cashflow calculation."""
        query = select(Record).where(
            Record.workspace_id == workspace_id,
            Record.date_cashflow >= params.from_date,
            Record.date_cashflow <= params.to_date,
            Record.deleted_at.is_(None),
        )

        if params.areas:
            query = query.where(Record.area.in_(params.areas))

        if params.stages:
            query = query.where(Record.stage.in_(params.stages))

        if params.bank_account_id:
            query = query.where(Record.bank_account_id == params.bank_account_id)

        if params.sign_filter == "in":
            query = query.where(Record.amount > 0)
        elif params.sign_filter == "out":
            query = query.where(Record.amount < 0)

        query = query.order_by(Record.date_cashflow)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    def _aggregate_entries(
        self,
        entries: list[CashflowEntry],
        group_by: str,
    ) -> list[CashflowEntry]:
        """Aggregate entries by week or month."""
        if not entries:
            return entries

        def get_group_key(d: date) -> date:
            if group_by == "week":
                # Start of week (Monday)
                return d - timedelta(days=d.weekday())
            else:  # month
                return d.replace(day=1)

        grouped = defaultdict(lambda: {
            "inflows": Decimal("0"),
            "outflows": Decimal("0"),
            "records": [],
        })

        running_balance = entries[-1].running_balance if entries else Decimal("0")

        for entry in entries:
            key = get_group_key(entry.date)
            grouped[key]["inflows"] += entry.inflows
            grouped[key]["outflows"] += entry.outflows
            if entry.records:
                grouped[key]["records"].extend(entry.records)
            grouped[key]["running_balance"] = entry.running_balance

        result = []
        for group_date in sorted(grouped.keys()):
            data = grouped[group_date]
            result.append(CashflowEntry(
                date=group_date,
                inflows=data["inflows"],
                outflows=data["outflows"],
                net=data["inflows"] + data["outflows"],
                running_balance=data["running_balance"],
                records=data["records"] if data["records"] else None,
            ))

        return result

    async def calculate_consolidated_cashflow(
        self,
        workspace_ids: list[str],
        from_date: date,
        to_date: date,
        user_id: str,
    ) -> CashflowResponse:
        """Calculate consolidated cashflow across multiple workspaces."""
        # Aggregate results from multiple workspaces
        # Implementation would check user permissions for each workspace
        # and aggregate the results
        params = CashflowRequest(
            from_date=from_date,
            to_date=to_date,
        )

        all_entries = []
        total_initial = Decimal("0")

        for workspace_id in workspace_ids:
            result = await self.calculate_cashflow(workspace_id, params)
            all_entries.extend(result.cashflow)
            total_initial += result.initial_balance.total

        # Merge and aggregate
        # This is a simplified version - full implementation would
        # properly merge entries by date

        return CashflowResponse(
            parameters=params,
            initial_balance=InitialBalance(
                date=from_date,
                total=total_initial,
                by_account={},
            ),
            cashflow=all_entries,
            summary=CashflowSummary(
                total_inflows=Decimal("0"),
                total_outflows=Decimal("0"),
                net_cashflow=Decimal("0"),
                final_balance=Decimal("0"),
                min_balance=BalancePoint(date=from_date, amount=Decimal("0")),
                max_balance=BalancePoint(date=from_date, amount=Decimal("0")),
                credit_limit_breaches=[],
            ),
        )
