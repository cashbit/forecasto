"""Project schemas."""

from __future__ import annotations


from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

class PhaseCreate(BaseModel):
    """Phase creation request."""

    name: str
    description: str | None = None
    sequence: int
    current_area: str = "prospect"
    expected_start: date | None = None
    expected_end: date | None = None
    expected_revenue: Decimal | None = None
    expected_costs: Decimal | None = None

    @field_validator("current_area")
    @classmethod
    def validate_area(cls, v: str) -> str:
        valid_areas = ["budget", "prospect", "orders", "actual"]
        if v not in valid_areas:
            raise ValueError(f"Area must be one of: {valid_areas}")
        return v

class PhaseResponse(BaseModel):
    """Phase response."""

    id: str
    project_id: str
    name: str
    description: str | None = None
    sequence: int
    current_area: str
    expected_start: date | None = None
    expected_end: date | None = None
    actual_start: date | None = None
    actual_end: date | None = None
    expected_revenue: Decimal | None = None
    expected_costs: Decimal | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class ProjectCreate(BaseModel):
    """Project creation request."""

    name: str
    description: str | None = None
    customer_ref: str | None = None
    code: str | None = None
    expected_revenue: Decimal | None = None
    expected_costs: Decimal | None = None
    expected_margin: Decimal | None = None
    status: str = "draft"
    start_date: date | None = None
    end_date: date | None = None
    phases: list[PhaseCreate] | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        valid_statuses = ["draft", "active", "won", "lost", "completed", "on_hold"]
        if v not in valid_statuses:
            raise ValueError(f"Status must be one of: {valid_statuses}")
        return v

class ProjectUpdate(BaseModel):
    """Project update request."""

    name: str | None = None
    description: str | None = None
    customer_ref: str | None = None
    code: str | None = None
    expected_revenue: Decimal | None = None
    expected_costs: Decimal | None = None
    expected_margin: Decimal | None = None
    status: str | None = None
    start_date: date | None = None
    end_date: date | None = None

class ProjectResponse(BaseModel):
    """Project response."""

    id: str
    workspace_id: str
    name: str
    description: str | None = None
    customer_ref: str | None = None
    code: str | None = None
    expected_revenue: Decimal | None = None
    expected_costs: Decimal | None = None
    expected_margin: Decimal | None = None
    status: str
    start_date: date | None = None
    end_date: date | None = None
    phases: list[PhaseResponse] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
