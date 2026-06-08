"""Collection schemas — schema-less document store per workspace."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Collection
# ---------------------------------------------------------------------------

class CollectionCreate(BaseModel):
    """Create a new collection. `slug` is derived from `name` if omitted."""

    name: str
    slug: str | None = None
    description: str | None = None
    handler_instructions: str | None = None
    extraction_schema: dict[str, Any] = Field(default_factory=dict)
    classification_hints: dict[str, Any] = Field(default_factory=dict)


class CollectionUpdate(BaseModel):
    """Partial update of a collection (incl. the handler contract)."""

    name: str | None = None
    description: str | None = None
    handler_instructions: str | None = None
    extraction_schema: dict[str, Any] | None = None
    classification_hints: dict[str, Any] | None = None
    is_archived: bool | None = None


class CollectionResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None
    handler_instructions: str | None
    extraction_schema: dict[str, Any]
    classification_hints: dict[str, Any]
    document_count: int
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------

class CollectionDocumentCreate(BaseModel):
    """Create a document. `collection_id` None => quarantine."""

    collection_id: str | None = None
    title: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    source_filename: str | None = None
    source_hash: str | None = None
    source_origin: str = "mcp"
    document_type: str | None = None
    quarantine_reason: str | None = None
    classification_confidence: float | None = None
    inbox_item_id: str | None = None


class CollectionDocumentUpdate(BaseModel):
    title: str | None = None
    data: dict[str, Any] | None = None
    status: Literal["active", "archived"] | None = None


class CollectionDocumentResponse(BaseModel):
    id: str
    workspace_id: str
    collection_id: str | None
    status: str
    title: str | None
    data: dict[str, Any]
    source_filename: str | None
    source_hash: str | None
    source_origin: str
    document_type: str | None
    quarantine_reason: str | None
    classification_confidence: float | None
    inbox_item_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Quarantine routing + JSON query
# ---------------------------------------------------------------------------

class DocumentRouteRequest(BaseModel):
    """Move a quarantined document into a collection."""

    collection_id: str


class DocumentFilter(BaseModel):
    """A single JSON-field predicate, e.g. {path: "$.banca", op: "eq", value: "Intesa"}."""

    path: str  # SQLite json path, e.g. "$.header.iban"
    op: Literal["eq", "ne", "gt", "gte", "lt", "lte", "contains"] = "eq"
    value: Any = None


class DocumentQuery(BaseModel):
    """Query documents within a collection by JSON-field predicates."""

    filters: list[DocumentFilter] = Field(default_factory=list)
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class QuarantineCountResponse(BaseModel):
    quarantined: int
