"""Customer service — anagrafiche cliente over the ``customers`` collection.

Customers are upserted idempotently keyed on the (normalized) VAT id, falling
back to the tax number for parties without a VAT id (private individuals /
foreign customers). Built entirely on :class:`CollectionService` so it inherits
soft-delete, JSON-path querying and source_hash idempotency.
"""

from __future__ import annotations

import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import NotFoundException, ValidationException
from forecasto.models.collection import CollectionDocument
from forecasto.models.numerator import Numerator
from forecasto.schemas.collection import (
    CollectionDocumentCreate,
    CollectionDocumentUpdate,
    DocumentFilter,
    DocumentQuery,
)
from forecasto.schemas.customer import CustomerUpsert
from forecasto.schemas.numerator import NumeratorCreate
from forecasto.services.collection_service import CollectionService
from forecasto.services.numerator_service import NumeratorService
from forecasto.services.vies_service import normalize_vat

CUSTOMERS_SLUG = "customers"
CUSTOMERS_NAME = "Clienti"
CUSTOMERS_DESC = "Anagrafiche cliente per la fatturazione attiva"

# Numerator that assigns the human customer code (CUSTNUMBER), e.g. C00001.
CUSTNUMBER_KEY = "custnumber"


def _source_hash(key: str) -> str:
    return hashlib.sha256(f"customer:{key}".encode("utf-8")).hexdigest()


class CustomerService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.collections = CollectionService(db)

    async def _collection_id(self, workspace_id: str, user_id: str | None = None) -> str:
        coll = await self.collections.get_or_create_system_collection(
            workspace_id, CUSTOMERS_SLUG, CUSTOMERS_NAME,
            description=CUSTOMERS_DESC, user_id=user_id,
        )
        return coll.id

    async def _assign_customer_code(self, workspace_id: str, user_id: str | None) -> str:
        """Issue the next CUSTNUMBER code (e.g. C00001), creating the numerator
        on first use (prefix 'C', 5 digits, no reset, immediate issuance)."""
        ns = NumeratorService(self.db)
        res = await self.db.execute(
            select(Numerator).where(
                Numerator.workspace_id == workspace_id,
                Numerator.key == CUSTNUMBER_KEY,
                Numerator.deleted_at.is_(None),
            )
        )
        num = res.scalar_one_or_none()
        if num is None:
            num = await ns.create_numerator(
                workspace_id,
                NumeratorCreate(
                    key=CUSTNUMBER_KEY, name="Codice cliente", prefix="C",
                    separator="", padding=5, reset_policy="never", confirm_ttl_seconds=0,
                ),
                user_id=user_id,
            )
        issued = await ns.reserve(workspace_id, num.id, user_id)  # immediate mode → issued
        return issued.formatted

    def _build_data(self, payload: CustomerUpsert, vat_id: str | None) -> dict:
        data = {
            "kind": "customer",
            "legal_name": payload.legal_name,
            "vat_id": vat_id,
            "tax_number": (payload.tax_number or "").strip().upper() or None,
            "country_code": (payload.country_code or "IT").upper(),
            "address": payload.address.model_dump(),
            "sdi": payload.sdi.model_dump(),
            "contact": payload.contact.model_dump(),
            "default_payment_terms": payload.default_payment_terms,
            "notes": payload.notes,
            "source": payload.source or "manual",
        }
        if payload.vies is not None:
            data["vies"] = payload.vies
        return data

    async def upsert_customer(
        self, workspace_id: str, payload: CustomerUpsert, user_id: str | None = None
    ) -> CollectionDocument:
        cc, vat = normalize_vat(payload.country_code, payload.vat_id)
        vat_id = f"{cc}{vat}" if (cc and vat) else None
        tax_number = (payload.tax_number or "").strip().upper() or None
        key = vat_id or tax_number
        if not key:
            raise ValidationException(
                "Cliente senza P.IVA né codice fiscale: indicarne almeno uno"
            )

        collection_id = await self._collection_id(workspace_id, user_id)
        data = self._build_data(payload, vat_id)

        existing = await self._find_by_key(workspace_id, collection_id, vat_id, tax_number)
        if existing is not None:
            # Preserve fields not re-submitted (e.g. an earlier vies provenance block).
            merged = {**(existing.data or {}), **data}
            return await self.collections.update_document(
                workspace_id, existing.id,
                CollectionDocumentUpdate(title=payload.legal_name, data=merged),
            )

        # New customer → assign a human code (CUSTNUMBER).
        data["customer_code"] = await self._assign_customer_code(workspace_id, user_id)
        return await self.collections.create_document(
            workspace_id,
            CollectionDocumentCreate(
                collection_id=collection_id,
                title=payload.legal_name,
                data=data,
                source_hash=_source_hash(key),
                source_origin="manual",
                document_type="customer",
            ),
            user_id=user_id,
        )

    async def _find_by_key(
        self, workspace_id: str, collection_id: str,
        vat_id: str | None, tax_number: str | None,
    ) -> CollectionDocument | None:
        for path, value in (("$.vat_id", vat_id), ("$.tax_number", tax_number)):
            if not value:
                continue
            docs, _ = await self.collections.query_documents(
                workspace_id, collection_id,
                DocumentQuery(filters=[DocumentFilter(path=path, op="eq", value=value)], limit=1),
            )
            if docs:
                return docs[0]
        return None

    async def find_by_vat(
        self, workspace_id: str, country_code: str | None, vat: str | None
    ) -> CollectionDocument | None:
        cc, num = normalize_vat(country_code, vat)
        vat_id = f"{cc}{num}" if (cc and num) else None
        if not vat_id:
            return None
        collection_id = await self._collection_id(workspace_id)
        return await self._find_by_key(workspace_id, collection_id, vat_id, None)

    async def list_customers(
        self, workspace_id: str, search: str | None = None,
        limit: int = 100, offset: int = 0,
    ) -> tuple[list[CollectionDocument], int]:
        """List/search customers. Search matches (case-insensitive substring)
        across legal name, VAT id, tax number and customer code — an OR the
        single-filter JSON query can't express, so done in Python over the set."""
        collection_id = await self._collection_id(workspace_id)
        docs, _ = await self.collections.list_documents(
            workspace_id, collection_id, limit=1000, offset=0
        )
        if search:
            s = search.strip().lower()
            fields = ("legal_name", "vat_id", "tax_number", "customer_code")
            docs = [
                d for d in docs
                if any(s in str((d.data or {}).get(f) or "").lower() for f in fields)
            ]
        total = len(docs)
        return docs[offset:offset + limit], total

    async def get_customer(self, workspace_id: str, document_id: str) -> CollectionDocument:
        doc = await self.collections.get_document(workspace_id, document_id)
        if (doc.data or {}).get("kind") != "customer":
            raise NotFoundException(f"Cliente {document_id} non trovato")
        return doc
