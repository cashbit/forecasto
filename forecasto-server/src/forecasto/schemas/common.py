"""Common schema definitions."""

from __future__ import annotations


from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")

class SuccessResponse(BaseModel):
    """Standard success response."""

    success: bool = True

class ErrorResponse(BaseModel):
    """Standard error response."""

    success: bool = False
    error: str
    error_code: str
    details: dict[str, Any] | None = None

class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated response wrapper."""

    success: bool = True
    items: list[T]
    total: int
    page: int = 1
    page_size: int = 50
    has_more: bool = False
