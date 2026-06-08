"""Collection models — schema-less NoSQL-like document store per workspace.

A `Collection` is a named bucket of arbitrary JSON documents (e.g. "Estratti
conto banca X", "Buste paga", "Contratti"). Each collection carries the
"handler" contract — free-text instructions + an optional JSON Schema — that
tells an LLM how a document of this kind should be parsed.

A `CollectionDocument` holds one arbitrary-JSON payload. A document with
`collection_id IS NULL` and `status == "quarantined"` is in quarantine: it
could not be classified and awaits the user routing it to a collection.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from forecasto.models.workspace import Workspace


class Collection(Base, UUIDMixin, TimestampMixin):
    """A named, schema-less document store scoped to a workspace."""

    __tablename__ = "collections"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_collection_workspace_slug"),
    )

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # --- The LLM contract: how a document of this kind is parsed / what it holds ---
    handler_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    extraction_schema: Mapped[dict] = mapped_column(JSON, default=dict)  # JSON Schema (optional)
    # Hints to route docs here (keywords, filename patterns, doc_type) — used later by the Inbox.
    classification_hints: Mapped[dict] = mapped_column(JSON, default=dict)

    # Denormalised counter for list views; maintained by the service.
    document_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="collections")
    documents: Mapped[list["CollectionDocument"]] = relationship(
        "CollectionDocument", back_populates="collection", cascade="all, delete-orphan"
    )


class CollectionDocument(Base, UUIDMixin, TimestampMixin):
    """A single arbitrary-JSON document; belongs to a collection or sits in quarantine."""

    __tablename__ = "collection_documents"

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # NULL collection_id => quarantined / unclassified, awaiting user routing.
    collection_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("collections.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # active | quarantined | archived
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", index=True
    )

    # Human-readable title surfaced in lists (e.g. "EC Marzo 2026", "Fattura INV-2026-0211")
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # The arbitrary JSON payload (bank statement, FatturaPA, contract, payslip…)
    data: Mapped[dict] = mapped_column(JSON, default=dict)

    # Source tracking — mirrors InboxItem
    source_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)  # SHA256
    source_origin: Mapped[str] = mapped_column(
        String(20), nullable=False, default="mcp"
    )  # mcp | inbox | api | manual

    # Quarantine triage / debugging
    document_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    quarantine_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    classification_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Link back to the originating Inbox item, when applicable (Phase 2)
    inbox_item_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("inbox_items.id"), nullable=True
    )

    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    collection: Mapped[Optional["Collection"]] = relationship("Collection", back_populates="documents")
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="collection_documents")
