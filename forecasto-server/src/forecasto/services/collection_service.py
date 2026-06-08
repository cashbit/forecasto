"""Collection service — schema-less document store per workspace.

Handles CRUD for collections and their documents, the quarantine flow
(documents with `collection_id IS NULL`), JSON-field querying via SQLite
`json_extract`, and the machine-ingestion auth helpers (reused from
`InboxService`).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import ConflictException, NotFoundException, ValidationException
from forecasto.models.collection import Collection, CollectionDocument
from forecasto.schemas.collection import (
    CollectionCreate,
    CollectionDocumentCreate,
    CollectionDocumentUpdate,
    CollectionUpdate,
    DocumentQuery,
)
from forecasto.services.inbox_service import InboxService

logger = logging.getLogger(__name__)

_SLUG_RE = re.compile(r"[^a-z0-9]+")

# Map filter ops to SQLAlchemy comparisons on a json_extract expression.
_OP_MAP = {
    "eq": lambda col, v: col == v,
    "ne": lambda col, v: col != v,
    "gt": lambda col, v: col > v,
    "gte": lambda col, v: col >= v,
    "lt": lambda col, v: col < v,
    "lte": lambda col, v: col <= v,
    "contains": lambda col, v: col.like(f"%{v}%"),
}


def _slugify(value: str) -> str:
    slug = _SLUG_RE.sub("-", (value or "").strip().lower()).strip("-")
    return slug or "collection"


class CollectionService:
    """Service for collections and collection documents."""

    def __init__(self, db: AsyncSession):
        self.db = db
        # Reuse the inbox machine-auth helpers (API key / agent token).
        self._inbox = InboxService(db)

    # Expose inbox auth helpers so routers can authenticate machine callers
    # exactly like the inbox endpoints do.
    async def get_user_from_agent_token(self, raw_token: str):
        return await self._inbox.get_user_from_agent_token(raw_token)

    async def get_workspace_id_from_api_key(self, raw_key: str) -> str:
        return await self._inbox.get_workspace_id_from_api_key(raw_key)

    async def verify_agent_workspace_access(self, user_id: str, workspace_id: str) -> bool:
        return await self._inbox.verify_agent_workspace_access(user_id, workspace_id)

    # -------------------------------------------------------------------------
    # Collections CRUD
    # -------------------------------------------------------------------------

    async def _unique_slug(self, workspace_id: str, base: str) -> str:
        """Return a slug unique within the workspace (appends -2, -3, … if taken)."""
        slug = base
        suffix = 1
        while True:
            existing = await self.db.execute(
                select(Collection.id).where(
                    Collection.workspace_id == workspace_id,
                    Collection.slug == slug,
                    Collection.deleted_at.is_(None),
                )
            )
            if existing.scalar_one_or_none() is None:
                return slug
            suffix += 1
            slug = f"{base}-{suffix}"

    async def create_collection(
        self,
        workspace_id: str,
        data: CollectionCreate,
        user_id: str | None = None,
    ) -> Collection:
        base = _slugify(data.slug or data.name)
        slug = await self._unique_slug(workspace_id, base)
        collection = Collection(
            workspace_id=workspace_id,
            name=data.name,
            slug=slug,
            description=data.description,
            handler_instructions=data.handler_instructions,
            extraction_schema=data.extraction_schema or {},
            classification_hints=data.classification_hints or {},
            document_count=0,
            is_archived=False,
            created_by=user_id,
        )
        self.db.add(collection)
        await self.db.flush()
        await self.db.refresh(collection)
        return collection

    async def list_collections(
        self,
        workspace_id: str,
        include_archived: bool = False,
    ) -> list[Collection]:
        stmt = select(Collection).where(
            Collection.workspace_id == workspace_id,
            Collection.deleted_at.is_(None),
        )
        if not include_archived:
            stmt = stmt.where(Collection.is_archived.is_(False))
        stmt = stmt.order_by(Collection.name.asc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_collection(self, workspace_id: str, collection_id: str) -> Collection:
        result = await self.db.execute(
            select(Collection).where(
                Collection.id == collection_id,
                Collection.workspace_id == workspace_id,
                Collection.deleted_at.is_(None),
            )
        )
        collection = result.scalar_one_or_none()
        if not collection:
            raise NotFoundException(f"Collection {collection_id} non trovata")
        return collection

    async def update_collection(
        self,
        workspace_id: str,
        collection_id: str,
        data: CollectionUpdate,
    ) -> Collection:
        collection = await self.get_collection(workspace_id, collection_id)
        if data.name is not None:
            collection.name = data.name
        if data.description is not None:
            collection.description = data.description
        if data.handler_instructions is not None:
            collection.handler_instructions = data.handler_instructions
        if data.extraction_schema is not None:
            collection.extraction_schema = data.extraction_schema
        if data.classification_hints is not None:
            collection.classification_hints = data.classification_hints
        if data.is_archived is not None:
            collection.is_archived = data.is_archived
        await self.db.flush()
        await self.db.refresh(collection)
        return collection

    async def delete_collection(self, workspace_id: str, collection_id: str) -> None:
        """Soft-delete a collection and its documents."""
        collection = await self.get_collection(workspace_id, collection_id)
        now = datetime.utcnow()
        collection.deleted_at = now
        # Soft-delete the documents too (the FK cascade only fires on hard delete).
        result = await self.db.execute(
            select(CollectionDocument).where(
                CollectionDocument.collection_id == collection_id,
                CollectionDocument.deleted_at.is_(None),
            )
        )
        for doc in result.scalars().all():
            doc.deleted_at = now
        await self.db.flush()

    # -------------------------------------------------------------------------
    # Documents CRUD
    # -------------------------------------------------------------------------

    async def create_document(
        self,
        workspace_id: str,
        data: CollectionDocumentCreate,
        user_id: str | None = None,
    ) -> CollectionDocument:
        """Create a document. If `collection_id` is None it goes to quarantine."""
        collection: Collection | None = None
        if data.collection_id:
            collection = await self.get_collection(workspace_id, data.collection_id)
            status = "active"
        else:
            status = "quarantined"

        # Dedup on source_hash within the workspace (idempotent ingestion).
        if data.source_hash:
            existing = await self.db.execute(
                select(CollectionDocument).where(
                    CollectionDocument.workspace_id == workspace_id,
                    CollectionDocument.source_hash == data.source_hash,
                    CollectionDocument.deleted_at.is_(None),
                )
            )
            dup = existing.scalar_one_or_none()
            if dup is not None:
                return dup

        doc = CollectionDocument(
            workspace_id=workspace_id,
            collection_id=data.collection_id,
            status=status,
            title=data.title,
            data=data.data or {},
            source_filename=data.source_filename,
            source_hash=data.source_hash,
            source_origin=data.source_origin or "mcp",
            document_type=data.document_type,
            quarantine_reason=data.quarantine_reason,
            classification_confidence=data.classification_confidence,
            inbox_item_id=data.inbox_item_id,
            created_by=user_id,
        )
        self.db.add(doc)
        if collection is not None:
            collection.document_count = (collection.document_count or 0) + 1
        await self.db.flush()
        await self.db.refresh(doc)
        return doc

    async def list_documents(
        self,
        workspace_id: str,
        collection_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[CollectionDocument], int]:
        # Ensure the collection exists / belongs to the workspace.
        await self.get_collection(workspace_id, collection_id)

        base = select(CollectionDocument).where(
            CollectionDocument.workspace_id == workspace_id,
            CollectionDocument.collection_id == collection_id,
            CollectionDocument.deleted_at.is_(None),
        )
        total = await self.db.scalar(
            select(func.count()).select_from(base.subquery())
        )
        result = await self.db.execute(
            base.order_by(CollectionDocument.created_at.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars().all()), int(total or 0)

    async def get_document(
        self,
        workspace_id: str,
        document_id: str,
    ) -> CollectionDocument:
        result = await self.db.execute(
            select(CollectionDocument).where(
                CollectionDocument.id == document_id,
                CollectionDocument.workspace_id == workspace_id,
                CollectionDocument.deleted_at.is_(None),
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise NotFoundException(f"Documento {document_id} non trovato")
        return doc

    async def update_document(
        self,
        workspace_id: str,
        document_id: str,
        data: CollectionDocumentUpdate,
    ) -> CollectionDocument:
        doc = await self.get_document(workspace_id, document_id)
        if data.title is not None:
            doc.title = data.title
        if data.data is not None:
            doc.data = data.data
        if data.status is not None:
            doc.status = data.status
        await self.db.flush()
        await self.db.refresh(doc)
        return doc

    async def delete_document(self, workspace_id: str, document_id: str) -> None:
        doc = await self.get_document(workspace_id, document_id)
        doc.deleted_at = datetime.utcnow()
        if doc.collection_id:
            collection = await self.db.get(Collection, doc.collection_id)
            if collection and (collection.document_count or 0) > 0:
                collection.document_count -= 1
        await self.db.flush()

    async def query_documents(
        self,
        workspace_id: str,
        collection_id: str,
        query: DocumentQuery,
    ) -> tuple[list[CollectionDocument], int]:
        """Filter documents within a collection by JSON-field predicates.

        Always scopes by indexed columns first; `json_extract` then runs only
        over the already-filtered subset of that collection's rows.
        """
        await self.get_collection(workspace_id, collection_id)

        stmt = select(CollectionDocument).where(
            CollectionDocument.workspace_id == workspace_id,
            CollectionDocument.collection_id == collection_id,
            CollectionDocument.deleted_at.is_(None),
        )
        for f in query.filters:
            if f.op not in _OP_MAP:
                raise ValidationException(f"Operatore non supportato: {f.op}")
            col = func.json_extract(CollectionDocument.data, f.path)
            stmt = stmt.where(_OP_MAP[f.op](col, f.value))

        total = await self.db.scalar(select(func.count()).select_from(stmt.subquery()))
        result = await self.db.execute(
            stmt.order_by(CollectionDocument.created_at.desc())
            .limit(query.limit)
            .offset(query.offset)
        )
        return list(result.scalars().all()), int(total or 0)

    # -------------------------------------------------------------------------
    # Quarantine
    # -------------------------------------------------------------------------

    async def list_quarantine(
        self,
        workspace_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[CollectionDocument], int]:
        base = select(CollectionDocument).where(
            CollectionDocument.workspace_id == workspace_id,
            CollectionDocument.collection_id.is_(None),
            CollectionDocument.status == "quarantined",
            CollectionDocument.deleted_at.is_(None),
        )
        total = await self.db.scalar(select(func.count()).select_from(base.subquery()))
        result = await self.db.execute(
            base.order_by(CollectionDocument.created_at.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars().all()), int(total or 0)

    async def count_quarantine(self, workspace_id: str) -> int:
        total = await self.db.scalar(
            select(func.count()).select_from(
                select(CollectionDocument)
                .where(
                    CollectionDocument.workspace_id == workspace_id,
                    CollectionDocument.collection_id.is_(None),
                    CollectionDocument.status == "quarantined",
                    CollectionDocument.deleted_at.is_(None),
                )
                .subquery()
            )
        )
        return int(total or 0)

    async def route_document(
        self,
        workspace_id: str,
        document_id: str,
        collection_id: str,
    ) -> CollectionDocument:
        """Assign a quarantined document to a collection."""
        doc = await self.get_document(workspace_id, document_id)
        if doc.collection_id is not None or doc.status != "quarantined":
            raise ConflictException("Il documento non è in quarantena")
        collection = await self.get_collection(workspace_id, collection_id)
        doc.collection_id = collection.id
        doc.status = "active"
        doc.quarantine_reason = None
        collection.document_count = (collection.document_count or 0) + 1
        await self.db.flush()
        await self.db.refresh(doc)
        return doc
