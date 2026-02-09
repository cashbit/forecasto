"""Bank account schemas."""

from __future__ import annotations


from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

class BankAccountCreate(BaseModel):
    """Bank account creation request."""

    name: str
    bank_name: str | None = None
    description: str | None = None
    currency: str = "EUR"
    credit_limit: Decimal = Decimal("0")
    settings: dict | None = None

class BankAccountUpdate(BaseModel):
    """Bank account update request."""

    name: str | None = None
    bank_name: str | None = None
    description: str | None = None
    currency: str | None = None
    credit_limit: Decimal | None = None
    is_active: bool | None = None
    settings: dict | None = None

class BankAccountResponse(BaseModel):
    """Bank account response."""

    id: str
    owner_id: str | None = None
    name: str
    bank_name: str | None = None
    description: str | None = None
    currency: str
    credit_limit: Decimal
    is_active: bool
    settings: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class BalanceCreate(BaseModel):
    """Bank account balance creation request."""

    balance_date: date
    balance: Decimal
    source: str = "manual"
    note: str | None = None

class BalanceResponse(BaseModel):
    """Bank account balance response."""

    id: str
    bank_account_id: str
    balance_date: date
    balance: Decimal
    source: str
    recorded_at: datetime
    note: str | None = None

    model_config = {"from_attributes": True}
