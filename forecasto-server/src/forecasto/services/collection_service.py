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
    DocumentAggregateQuery,
    DocumentOrderBy,
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

# Map aggregate fn names to SQLAlchemy aggregate functions.
_AGG_FN = {
    "sum": func.sum,
    "count": func.count,
    "avg": func.avg,
    "min": func.min,
    "max": func.max,
}

# Parse a JSON path like "$.righe[0].importo" into segments: ["righe", 0, "importo"].
_PATH_SEG_RE = re.compile(r"\.([^.\[]+)|\[(\d+)\]")


def _slugify(value: str) -> str:
    slug = _SLUG_RE.sub("-", (value or "").strip().lower()).strip("-")
    return slug or "collection"


def _parse_json_path(path: str) -> list[str | int]:
    """Turn a SQLite-style JSON path into a list of dict-keys / array-indices.

    "$.cliente" -> ["cliente"]; "$.a.b" -> ["a", "b"];
    "$.righe[0].importo" -> ["righe", 0, "importo"].
    """
    segments: list[str | int] = []
    for key, idx in _PATH_SEG_RE.findall(path):
        if key:
            segments.append(key)
        elif idx:
            segments.append(int(idx))
    return segments


def project_data(data: dict, fields: list[str]) -> dict:
    """Reduce `data` to only the requested JSON paths, rebuilding the natural
    nested structure ($.cliente -> {"cliente": ...}, $.a.b -> {"a": {"b": ...}}).

    Paths that don't resolve are skipped. Mirrors json_extract semantics but
    keeps native dicts/lists instead of JSON text.
    """
    out: dict = {}
    for path in fields:
        segments = _parse_json_path(path)
        if not segments:
            continue
        # Read the value following the path.
        cur: Any = data
        ok = True
        for seg in segments:
            if isinstance(seg, int):
                if isinstance(cur, list) and 0 <= seg < len(cur):
                    cur = cur[seg]
                else:
                    ok = False
                    break
            else:
                if isinstance(cur, dict) and seg in cur:
                    cur = cur[seg]
                else:
                    ok = False
                    break
        if not ok:
            continue
        # Rebuild the nested structure into `out`.
        node: Any = out
        for i, seg in enumerate(segments[:-1]):
            nxt = segments[i + 1]
            if isinstance(seg, int):
                while len(node) <= seg:
                    node.append({} if not isinstance(nxt, int) else [])
                if not isinstance(node[seg], (dict, list)):
                    node[seg] = [] if isinstance(nxt, int) else {}
                node = node[seg]
            else:
                if seg not in node or not isinstance(node[seg], (dict, list)):
                    node[seg] = [] if isinstance(nxt, int) else {}
                node = node[seg]
        last = segments[-1]
        if isinstance(last, int):
            while len(node) <= last:
                node.append(None)
            node[last] = cur
        else:
            node[last] = cur
    return out


def _apply_order_by(stmt, order_by: list[DocumentOrderBy] | None):
    """Apply order_by JSON paths, defaulting to newest-first by created_at."""
    if not order_by:
        return stmt.order_by(CollectionDocument.created_at.desc())
    cols = []
    for o in order_by:
        c = func.json_extract(CollectionDocument.data, o.path)
        cols.append(c.desc() if o.direction == "desc" else c.asc())
    return stmt.order_by(*cols)


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
        stmt = _apply_order_by(stmt, query.order_by)
        result = await self.db.execute(stmt.limit(query.limit).offset(query.offset))
        return list(result.scalars().all()), int(total or 0)

    async def aggregate_documents(
        self,
        workspace_id: str,
        collection_id: str,
        query: DocumentAggregateQuery,
    ) -> tuple[list[dict], int]:
        """GROUP BY + aggregation over a collection's documents, server-side.

        Result rows are keyed by the group_by JSON paths (e.g. "$.cliente") plus
        the aggregate aliases (`as`). Returns (results, total_groups).
        """
        await self.get_collection(workspace_id, collection_id)

        if not query.aggregates:
            raise ValidationException("Almeno un aggregato è richiesto")

        group_exprs = [
            func.json_extract(CollectionDocument.data, p) for p in query.group_by
        ]
        group_cols = [e.label(p) for e, p in zip(group_exprs, query.group_by)]

        agg_cols = []
        alias_cols: dict[str, Any] = {}
        for a in query.aggregates:
            if a.fn not in _AGG_FN:
                raise ValidationException(f"Funzione non supportata: {a.fn}")
            labeled = _AGG_FN[a.fn](
                func.json_extract(CollectionDocument.data, a.field)
            ).label(a.result_name)
            agg_cols.append(labeled)
            alias_cols[a.result_name] = labeled

        stmt = select(*group_cols, *agg_cols).where(
            CollectionDocument.workspace_id == workspace_id,
            CollectionDocument.collection_id == collection_id,
            CollectionDocument.deleted_at.is_(None),
        )
        for f in query.filters:
            if f.op not in _OP_MAP:
                raise ValidationException(f"Operatore non supportato: {f.op}")
            col = func.json_extract(CollectionDocument.data, f.path)
            stmt = stmt.where(_OP_MAP[f.op](col, f.value))

        if group_exprs:
            stmt = stmt.group_by(*group_exprs)

        # order_by may reference an aggregate alias (with or without '$.' prefix)
        # or a group_by JSON path; otherwise fall back to json_extract.
        if query.order_by:
            order_cols = []
            for o in query.order_by:
                alias_key = o.path[2:] if o.path.startswith("$.") else o.path
                if alias_key in alias_cols:
                    expr = alias_cols[alias_key]
                else:
                    expr = func.json_extract(CollectionDocument.data, o.path)
                order_cols.append(expr.desc() if o.direction == "desc" else expr.asc())
            stmt = stmt.order_by(*order_cols)

        total_groups = await self.db.scalar(
            select(func.count()).select_from(stmt.subquery())
        )
        rows = (await self.db.execute(stmt.limit(query.limit))).mappings().all()
        return [dict(r) for r in rows], int(total_groups or 0)

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
