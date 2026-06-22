"""e-Invoice XML generation — invoice document → CanonicalInvoice → target XML.

Maps a stored invoice document (the ``invoices`` collection JSON) onto the
e-invoice library's neutral :class:`CanonicalInvoice`, validates it with the
library's EN16931 pre-flight, then serializes to the standards required by the
emitter (and, if different, the recipient) country. Generated XMLs are stored in
the per-workspace ``e-invoices`` collection, one document per standard, kept in
sync with the source invoice via a content fingerprint.

Target selection: always emit the emitter-country standard; additionally emit
the recipient-country standard when the recipient is in a different country.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from einvoice.model import (
    BankAccount,
    CanonicalInvoice,
    FatturaPAExtension,
    InvoiceLine,
    InvoiceTypeCode,
    Party,
    PaymentTerms,
    PostalAddress,
    TaxBreakdownEntry,
    Totals,
)
from einvoice.normalize import normalize
from einvoice.serialize.cii import serialize_cii
from einvoice.serialize.fatturapa import serialize_fatturapa
from einvoice.serialize.ubl import serialize_peppol, serialize_xrechnung_ubl
from einvoice.validate import validate

# Build the serializer registry directly from the (lxml-only) serialize modules,
# avoiding einvoice.pipeline which pulls in the PDF-extraction dependencies we
# intentionally don't install on the server.
SERIALIZERS = {
    "fatturapa": serialize_fatturapa,
    "peppol": serialize_peppol,
    "xrechnung": serialize_xrechnung_ubl,
    "cii": serialize_cii,
}

from forecasto.models.collection import CollectionDocument
from forecasto.schemas.collection import (
    CollectionDocumentCreate,
    CollectionDocumentUpdate,
    DocumentFilter,
    DocumentQuery,
)
from forecasto.services.collection_service import CollectionService

EINVOICES_SLUG = "e-invoices"
EINVOICES_NAME = "e-Invoices (XML)"
EINVOICES_DESC = "XML fiscali generati dalle fatture (FatturaPA / EN16931)"

_EU = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
    "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
}

_CENT = Decimal("0.01")


def _D(v) -> Decimal:
    return v if isinstance(v, Decimal) else Decimal(str(v if v not in (None, "") else "0"))


def _q(v) -> Decimal:
    return _D(v).quantize(_CENT)


def _country_of_vat(vat_id: str | None, fallback: str = "IT") -> str:
    if vat_id and len(vat_id) >= 2 and vat_id[:2].isalpha():
        return vat_id[:2].upper()
    return fallback


def _standard_for_country(cc: str) -> str | None:
    cc = (cc or "").upper()
    if cc == "IT":
        return "fatturapa"
    if cc == "DE":
        return "xrechnung"
    if cc in _EU:
        return "peppol"
    return None


def targets_for(emitter_cc: str | None, recipient_cc: str | None) -> list[str]:
    """Standards to emit: always the emitter country's, plus the recipient
    country's when it differs (and is known)."""
    emitter_cc = (emitter_cc or "IT").upper()
    emitter_std = _standard_for_country(emitter_cc) or "fatturapa"
    targets = [emitter_std]
    if recipient_cc and recipient_cc.upper() != emitter_cc:
        rstd = _standard_for_country(recipient_cc)
        if rstd and rstd not in targets:
            targets.append(rstd)
    return targets


def _address(d: dict | None) -> PostalAddress:
    d = d or {}
    return PostalAddress(
        line_one=d.get("line_one"),
        line_two=d.get("line_two"),
        city=d.get("city"),
        postcode=d.get("postcode"),
        country_subdivision=d.get("province"),
        country_code=d.get("country_code"),
    )


def build_canonical(data: dict) -> CanonicalInvoice:
    """Map a stored invoice document onto a CanonicalInvoice (amounts → Decimal)."""
    emitter = data.get("emitter") or {}
    cust = data.get("customer_snapshot") or {}
    pay = data.get("payments") or {}
    ext_in = data.get("fattura_pa_ext") or {}
    sdi = cust.get("sdi") or {}
    type_code = data.get("type_code") or "380"

    seller = Party(
        name=emitter.get("legal_name"), vat_id=emitter.get("vat_id"),
        tax_number=emitter.get("tax_number"), address=_address(emitter.get("address")),
    )
    buyer = Party(
        name=cust.get("legal_name"), vat_id=cust.get("vat_id"),
        tax_number=cust.get("tax_number"), address=_address(cust.get("address")),
    )

    lines: list[InvoiceLine] = []
    for i, l in enumerate(data.get("lines", []), start=1):
        qty = _D(l.get("quantity", "1")) or Decimal("1")
        net = _q(l.get("line_net_amount", "0"))
        # Effective unit price keeps PrezzoTotale = Quantita × PrezzoUnitario
        # consistent even when a line discount was applied.
        unit = _q(net / qty) if qty else _q(l.get("net_unit_price", "0"))
        lines.append(InvoiceLine(
            id=str(l.get("id") or i),
            name=l.get("name"), description=l.get("description"),
            quantity=qty, unit_code=l.get("unit_code") or "C62",
            net_unit_price=unit, line_net_amount=net,
            vat_category=l.get("vat_category") or "S",
            vat_rate=_D(l.get("vat_rate", "0")),
        ))

    tax_breakdown = [
        TaxBreakdownEntry(
            category=e.get("category") or "S", rate=_D(e.get("rate", "0")),
            taxable_amount=_q(e.get("taxable_amount", "0")), tax_amount=_q(e.get("tax_amount", "0")),
        )
        for e in data.get("tax_breakdown", [])
    ]

    T = data.get("totals") or {}
    totals = Totals(
        line_total=_q(T.get("line_total", "0")),
        allowance_total=_q(T.get("allowance_total", "0")),
        charge_total=_q(T.get("charge_total", "0")),
        tax_basis_total=_q(T.get("tax_basis_total", "0")),
        tax_total=_q(T.get("tax_total", "0")),
        grand_total=_q(T.get("grand_total", "0")),
        prepaid_amount=_q(T.get("prepaid_amount", "0")),
        rounding_amount=_q(T.get("rounding_amount", "0")),
        due_payable=_q(T.get("due_payable", "0")),
    )

    bank = emitter.get("bank") or {}
    payment_account = (
        BankAccount(iban=bank.get("iban"), bic=bank.get("bic"), account_name=bank.get("account_name"))
        if bank.get("iban") else None
    )
    terms = [
        PaymentTerms(due_date=date.fromisoformat(s["due_date"]))
        for s in pay.get("scadenze", []) if s.get("due_date")
    ]

    fpa = FatturaPAExtension(
        tipo_documento=ext_in.get("tipo_documento") or ("TD04" if type_code == "381" else "TD01"),
        regime_fiscale=emitter.get("regime_fiscale") or ext_in.get("regime_fiscale") or "RF01",
        codice_destinatario=sdi.get("codice_destinatario") or "0000000",
        pec_destinatario=sdi.get("pec"),
        esigibilita_iva=pay.get("esigibilita_iva") or "I",
        causale=data.get("causale"),
    )

    return CanonicalInvoice(
        number=data.get("number") or "BOZZA",
        issue_date=date.fromisoformat(data["issue_date"]),
        type_code=InvoiceTypeCode(type_code),
        currency=data.get("currency") or "EUR",
        seller=seller, buyer=buyer,
        lines=lines, tax_breakdown=tax_breakdown, totals=totals,
        payment_means_code=pay.get("means_code"),
        payment_account=payment_account, payment_terms=terms,
        fattura_pa=fpa,
    )


def _filename(emitter_vat: str | None, number: str | None, standard: str) -> str:
    vat = (emitter_vat or "IT").replace(" ", "")
    num = (number or "draft").replace("/", "_").replace(" ", "")
    return f"{vat}_{num}_{standard}.xml"


class EInvoiceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.collections = CollectionService(db)

    async def _collection_id(self, workspace_id: str, user_id: str | None = None) -> str:
        coll = await self.collections.get_or_create_system_collection(
            workspace_id, EINVOICES_SLUG, EINVOICES_NAME, description=EINVOICES_DESC, user_id=user_id,
        )
        return coll.id

    async def _find_existing(self, workspace_id: str, collection_id: str, invoice_doc_id: str, standard: str):
        docs, _ = await self.collections.query_documents(
            workspace_id, collection_id,
            DocumentQuery(filters=[
                DocumentFilter(path="$.invoice_ref.document_id", op="eq", value=invoice_doc_id),
                DocumentFilter(path="$.standard", op="eq", value=standard),
            ], limit=1),
        )
        return docs[0] if docs else None

    async def generate(
        self, workspace_id: str, invoice_data: dict, user_id: str | None = None,
    ) -> list[CollectionDocument]:
        """(Re)generate the XML for every required standard and upsert it into
        the e-invoices collection. Idempotent on (invoice, standard); preserves
        any transmission state across regeneration. Returns the e-invoice docs."""
        canonical = normalize(build_canonical(invoice_data))
        result = validate(canonical)
        validation = {"ok": result.ok, "errors": result.errors, "warnings": result.warnings}

        emitter = invoice_data.get("emitter") or {}
        cust = invoice_data.get("customer_snapshot") or {}
        emitter_cc = _country_of_vat(emitter.get("vat_id"), "IT")
        recipient_cc = (cust.get("country_code") or _country_of_vat(cust.get("vat_id"), "")) or ""
        standards = targets_for(emitter_cc, recipient_cc)

        invoice_doc_id = invoice_data["__document_id"]
        number = invoice_data.get("number")
        fingerprint = (invoice_data.get("sync") or {}).get("data_fingerprint")
        now = datetime.utcnow().isoformat()
        collection_id = await self._collection_id(workspace_id, user_id)

        out: list[CollectionDocument] = []
        for standard in standards:
            xml_bytes = SERIALIZERS[standard](canonical)
            payload = {
                "kind": "einvoice",
                "invoice_ref": {"document_id": invoice_doc_id, "number": number},
                "standard": standard,
                "xml": xml_bytes.decode("utf-8"),
                "filename": _filename(emitter.get("vat_id"), number, standard),
                "generated_at": now,
                "source_fingerprint": fingerprint,
                "validation": validation,
                "stale": False,
            }
            existing = await self._find_existing(workspace_id, collection_id, invoice_doc_id, standard)
            if existing is not None:
                merged = {**(existing.data or {}), **payload}
                # Preserve any transmission state recorded on the previous version.
                merged["transmission"] = (existing.data or {}).get("transmission") or _empty_transmission()
                out.append(await self.collections.update_document(
                    workspace_id, existing.id, CollectionDocumentUpdate(data=merged),
                ))
            else:
                payload["transmission"] = _empty_transmission()
                out.append(await self.collections.create_document(
                    workspace_id,
                    CollectionDocumentCreate(
                        collection_id=collection_id,
                        title=f"{standard} · {number or 'bozza'}",
                        data=payload,
                        source_hash=hashlib.sha256(f"{invoice_doc_id}:{standard}".encode()).hexdigest(),
                        source_origin="manual", document_type="einvoice",
                    ),
                    user_id=user_id,
                ))
        return out

    async def list_for_invoice(self, workspace_id: str, invoice_doc_id: str) -> list[CollectionDocument]:
        collection_id = await self._collection_id(workspace_id)
        docs, _ = await self.collections.query_documents(
            workspace_id, collection_id,
            DocumentQuery(filters=[
                DocumentFilter(path="$.invoice_ref.document_id", op="eq", value=invoice_doc_id),
            ], limit=50),
        )
        return docs

    async def get_einvoice(self, workspace_id: str, document_id: str) -> CollectionDocument:
        return await self.collections.get_document(workspace_id, document_id)


def _empty_transmission() -> dict:
    return {"sent_at": None, "channel": "manual", "outcome": None, "outcome_at": None, "sdi_id": None, "notes": None}
