"""Invoice service — fatture attive over the ``invoices`` collection.

This module owns the *billing arithmetic* (the single source of truth for
amounts): line totals, VAT breakdown grouped by (category, rate), document
totals and the payment-schedule distribution — all in :class:`~decimal.Decimal`
and quantized to the cent so the e-invoice library's EN16931 validators pass.

Phase 2 covers draft create/update + recompute. Numbering, the emitter snapshot,
ledger records and XML generation land in later phases.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import ConflictException, NotFoundException, ValidationException
from forecasto.models.collection import CollectionDocument
from forecasto.models.numerator import Numerator
from forecasto.models.user import User
from forecasto.models.vat_registry import VatRegistry
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.collection import (
    CollectionDocumentCreate,
    CollectionDocumentUpdate,
)
from forecasto.schemas.invoice import InvoiceDraftCreate, InvoiceUpdate
from forecasto.schemas.numerator import NumeratorCreate
from forecasto.schemas.record import RecordCreate
from forecasto.services.collection_service import CollectionService
from forecasto.services.numerator_service import NumeratorService
from forecasto.services.payment_terms import parse_payment_terms
from forecasto.services.record_service import RecordService

INVOICE_NUMERATOR_KEY = "fatture-attive"

INVOICES_SLUG = "invoices"
INVOICES_NAME = "Fatture"
INVOICES_DESC = "Fatture attive emesse (testata, righe, pagamenti, scadenze)"

CENT = Decimal("0.01")


def _d(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value if value not in (None, "") else "0"))


def _q(value) -> Decimal:
    return _d(value).quantize(CENT, ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Billing arithmetic (pure)
# ---------------------------------------------------------------------------

def compute_billing(
    lines: list[dict], scadenze: list[dict], prepaid: Decimal | str = "0"
) -> dict:
    """Compute line nets, VAT breakdown, document totals and the scadenze split.

    Inputs and outputs carry monetary values as decimal *strings*. Returns a
    dict with keys: ``lines``, ``tax_breakdown``, ``totals``, ``scadenze``.
    """
    out_lines: list[dict] = []
    groups: dict[tuple, dict] = {}
    line_total = Decimal("0")

    for i, ln in enumerate(lines, start=1):
        qty = _d(ln.get("quantity", "1"))
        price = _q(ln.get("net_unit_price", "0"))
        disc = _d(ln.get("discount_percent") or "0")
        explicit = ln.get("line_net_amount")
        if explicit not in (None, ""):
            net = _q(explicit)
        else:
            gross = qty * price
            if disc:
                gross = gross * (Decimal("1") - disc / Decimal("100"))
            net = _q(gross)
        rate = _d(ln.get("vat_rate", "0"))
        category = ln.get("vat_category") or "S"
        natura = ln.get("natura")

        key = (category, str(rate), natura or "")
        grp = groups.setdefault(
            key, {"taxable": Decimal("0"), "category": category, "rate": rate, "natura": natura}
        )
        grp["taxable"] += net
        line_total += net

        out = dict(ln)
        out["id"] = ln.get("id") or str(i)
        out["quantity"] = str(qty)
        out["net_unit_price"] = str(price)
        out["line_net_amount"] = str(net)
        out["vat_rate"] = str(rate)
        out["vat_category"] = category
        out_lines.append(out)

    tax_breakdown: list[dict] = []
    tax_total = Decimal("0")
    for grp in groups.values():
        taxable = _q(grp["taxable"])
        tax = _q(taxable * grp["rate"] / Decimal("100"))
        tax_total += tax
        entry = {
            "category": grp["category"],
            "rate": str(grp["rate"]),
            "taxable_amount": str(taxable),
            "tax_amount": str(tax),
        }
        if grp["natura"]:
            entry["natura"] = grp["natura"]
        tax_breakdown.append(entry)

    line_total = _q(line_total)
    tax_basis_total = line_total
    tax_total = _q(tax_total)
    grand_total = _q(tax_basis_total + tax_total)
    prepaid_q = _q(prepaid)
    due_payable = _q(grand_total - prepaid_q)

    totals = {
        "line_total": str(line_total),
        "allowance_total": "0.00",
        "charge_total": "0.00",
        "tax_basis_total": str(tax_basis_total),
        "tax_total": str(tax_total),
        "grand_total": str(grand_total),
        "prepaid_amount": str(prepaid_q),
        "rounding_amount": "0.00",
        "due_payable": str(due_payable),
    }

    return {
        "lines": out_lines,
        "tax_breakdown": tax_breakdown,
        "totals": totals,
        "scadenze": _distribute_scadenze(scadenze, due_payable),
    }


def _distribute_scadenze(scadenze: list[dict], total: Decimal) -> list[dict]:
    """Return scadenze with amounts; auto-split ``total`` evenly when amounts are
    missing (last installment absorbs the cent remainder)."""
    if not scadenze:
        return []
    have_all = all(s.get("amount") not in (None, "") for s in scadenze)
    out: list[dict] = []
    if have_all:
        for i, s in enumerate(scadenze, start=1):
            o = dict(s)
            o["id"] = s.get("id") or f"sc{i}"
            o["amount"] = str(_q(s["amount"]))
            out.append(o)
        return out

    n = len(scadenze)
    base = _q(total / Decimal(n))
    acc = Decimal("0")
    for i, s in enumerate(scadenze, start=1):
        amount = base if i < n else _q(total - acc)
        acc += amount
        o = dict(s)
        o["id"] = s.get("id") or f"sc{i}"
        o["amount"] = str(amount)
        out.append(o)
    return out


_FINGERPRINT_KEYS = (
    "number", "issue_date", "type_code", "currency", "causale",
    "emitter", "customer_snapshot", "lines", "tax_breakdown", "totals",
    "payments", "extended", "fattura_pa_ext",
)


def compute_fingerprint(data: dict) -> str:
    sub = {k: data.get(k) for k in _FINGERPRINT_KEYS}
    return hashlib.sha256(
        json.dumps(sub, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()


def _iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class InvoiceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.collections = CollectionService(db)

    async def _collection_id(self, workspace_id: str, user_id: str | None = None) -> str:
        coll = await self.collections.get_or_create_system_collection(
            workspace_id, INVOICES_SLUG, INVOICES_NAME,
            description=INVOICES_DESC, user_id=user_id,
        )
        return coll.id

    async def _customer_snapshot(self, workspace_id: str, document_id: str | None):
        if not document_id:
            return None, None
        from forecasto.services.customer_service import CustomerService

        cust = await CustomerService(self.db).get_customer(workspace_id, document_id)
        snap = cust.data or {}
        ref = {"document_id": cust.id, "vat_id": snap.get("vat_id")}
        return ref, snap

    def _recompute(self, data: dict) -> dict:
        payments = data.get("payments") or {}
        # If no explicit scadenze but a payment-terms string + issue date are set,
        # derive the due dates deterministically from the terms (amounts are then
        # auto-distributed by compute_billing).
        if not payments.get("scadenze") and payments.get("terms") and data.get("issue_date"):
            try:
                parsed = parse_payment_terms(
                    payments["terms"], date.fromisoformat(data["issue_date"])
                )
                payments["scadenze"] = [{"due_date": p["due_date"]} for p in parsed]
            except (ValueError, TypeError):
                pass
        computed = compute_billing(
            data.get("lines", []),
            payments.get("scadenze", []),
            data.get("totals", {}).get("prepaid_amount", "0"),
        )
        data["lines"] = computed["lines"]
        data["tax_breakdown"] = computed["tax_breakdown"]
        data["totals"] = computed["totals"]
        payments["scadenze"] = computed["scadenze"]
        data["payments"] = payments
        data["sync"] = {
            "data_fingerprint": compute_fingerprint(data),
            "last_synced_at": datetime.utcnow().isoformat(),
        }
        return data

    async def create_draft(
        self, workspace_id: str, payload: InvoiceDraftCreate, user_id: str | None = None
    ) -> CollectionDocument:
        collection_id = await self._collection_id(workspace_id, user_id)
        customer_ref, customer_snapshot = await self._customer_snapshot(
            workspace_id, payload.customer_document_id
        )
        now = datetime.utcnow().isoformat()
        data = {
            "kind": "invoice",
            "number": None,
            "issue_date": _iso(payload.issue_date),
            "type_code": payload.type_code,
            "currency": payload.currency,
            "causale": payload.causale,
            "emitter": None,  # resolved at issuance
            "customer_ref": customer_ref,
            "customer_snapshot": customer_snapshot,
            "lines": [ln.model_dump(mode="json") for ln in payload.lines],
            "document_allowance_charges": [],
            "tax_breakdown": [],
            "totals": {"prepaid_amount": "0"},
            "payments": payload.payments.model_dump(mode="json"),
            "fattura_pa_ext": payload.fattura_pa_ext or {},
            "extended": payload.extended or {},
            "lifecycle": {"status": "draft", "created_at": now},
            "links": {
                "actual_record_ids": [],
                "einvoice_doc_ids": [],
                "source_order_record_ids": payload.source_order_record_ids,
                "credit_note_of": None,
                "intent_letter_id": payload.intent_letter_id,
            },
        }
        data = self._recompute(data)
        title = "Bozza fattura" + (f" — {customer_snapshot.get('legal_name')}" if customer_snapshot else "")
        return await self.collections.create_document(
            workspace_id,
            CollectionDocumentCreate(
                collection_id=collection_id, title=title, data=data,
                source_origin="manual", document_type="invoice",
            ),
            user_id=user_id,
        )

    async def get_invoice(self, workspace_id: str, document_id: str) -> CollectionDocument:
        doc = await self.collections.get_document(workspace_id, document_id)
        if (doc.data or {}).get("kind") != "invoice":
            raise NotFoundException(f"Fattura {document_id} non trovata")
        return doc

    async def list_invoices(
        self, workspace_id: str, limit: int = 100, offset: int = 0
    ) -> tuple[list[CollectionDocument], int]:
        collection_id = await self._collection_id(workspace_id)
        return await self.collections.list_documents(
            workspace_id, collection_id, limit=limit, offset=offset
        )

    async def update_draft(
        self, workspace_id: str, document_id: str, payload: InvoiceUpdate,
        user_id: str | None = None,
    ) -> CollectionDocument:
        doc = await self.get_invoice(workspace_id, document_id)
        data = dict(doc.data or {})
        lifecycle = data.get("lifecycle") or {}

        # A document already transmitted to SDI is fiscally frozen: correct it
        # with a credit note (TD04), not by mutating the issued invoice.
        if lifecycle.get("sdi_submitted_at"):
            raise ConflictException(
                "Fattura già inviata a SDI: usa una nota di credito per correggerla"
            )

        if payload.customer_document_id is not None:
            ref, snap = await self._customer_snapshot(workspace_id, payload.customer_document_id)
            data["customer_ref"] = ref
            data["customer_snapshot"] = snap
        if payload.type_code is not None:
            data["type_code"] = payload.type_code
        if payload.currency is not None:
            data["currency"] = payload.currency
        if payload.issue_date is not None:
            data["issue_date"] = _iso(payload.issue_date)
        if payload.causale is not None:
            data["causale"] = payload.causale
        if payload.lines is not None:
            data["lines"] = [ln.model_dump(mode="json") for ln in payload.lines]
        if payload.payments is not None:
            data["payments"] = payload.payments.model_dump(mode="json")
        if payload.fattura_pa_ext is not None:
            data["fattura_pa_ext"] = payload.fattura_pa_ext
        if payload.extended is not None:
            data["extended"] = payload.extended
        if payload.intent_letter_id is not None:
            links = dict(data.get("links") or {})
            links["intent_letter_id"] = payload.intent_letter_id
            data["links"] = links

        data = self._recompute(data)
        updated = await self.collections.update_document(
            workspace_id, document_id, CollectionDocumentUpdate(data=data)
        )

        # If the invoice is already issued, keep its XML(s) aligned to the edit.
        if lifecycle.get("status") in ("issued", "sent_to_client"):
            from forecasto.services.einvoice_service import EInvoiceService

            einvoice_docs = await EInvoiceService(self.db).generate(
                workspace_id, {**data, "__document_id": document_id}, user_id=user_id
            )
            links = dict(data.get("links") or {})
            links["einvoice_doc_ids"] = [d.id for d in einvoice_docs]
            data["links"] = links
            updated = await self.collections.update_document(
                workspace_id, document_id, CollectionDocumentUpdate(data=data)
            )
        return updated

    # -------------------------------------------------------------------------
    # Lifecycle (send to client / SDI submission)
    # -------------------------------------------------------------------------

    async def mark_sent_to_client(self, workspace_id: str, document_id: str) -> CollectionDocument:
        doc = await self.get_invoice(workspace_id, document_id)
        data = dict(doc.data or {})
        lc = dict(data.get("lifecycle") or {})
        if lc.get("status") == "draft":
            raise ConflictException("Emetti la fattura prima di inviarla al cliente")
        now = datetime.utcnow().isoformat()
        lc["sent_to_client_at"] = lc.get("sent_to_client_at") or now
        if not lc.get("sdi_submitted_at"):
            lc["status"] = "sent_to_client"
        data["lifecycle"] = lc
        return await self.collections.update_document(
            workspace_id, document_id, CollectionDocumentUpdate(data=data)
        )

    async def record_sdi_submission(
        self, workspace_id: str, document_id: str, outcome: str | None = None
    ) -> CollectionDocument:
        doc = await self.get_invoice(workspace_id, document_id)
        data = dict(doc.data or {})
        lc = dict(data.get("lifecycle") or {})
        if lc.get("status") == "draft":
            raise ConflictException("Emetti la fattura prima dell'invio a SDI")
        now = datetime.utcnow().isoformat()
        lc["sdi_submitted_at"] = lc.get("sdi_submitted_at") or now
        if outcome in ("accepted", "rejected"):
            lc["sdi_outcome"] = outcome
            lc["sdi_outcome_at"] = now
            lc["status"] = outcome
        else:
            lc["status"] = "sdi_submitted"
        data["lifecycle"] = lc
        updated = await self.collections.update_document(
            workspace_id, document_id, CollectionDocumentUpdate(data=data)
        )

        # Stamp transmission on the linked e-invoice XML documents.
        from forecasto.services.einvoice_service import EInvoiceService

        einv = EInvoiceService(self.db)
        for e in await einv.list_for_invoice(workspace_id, document_id):
            ed = dict(e.data or {})
            tr = dict(ed.get("transmission") or {})
            tr["sent_at"] = tr.get("sent_at") or now
            tr["channel"] = "manual"
            if outcome:
                tr["outcome"] = outcome
                tr["outcome_at"] = now
            ed["transmission"] = tr
            await self.collections.update_document(
                workspace_id, e.id, CollectionDocumentUpdate(data=ed)
            )
        return updated

    # -------------------------------------------------------------------------
    # Issuance (definitive number + ledger records)
    # -------------------------------------------------------------------------

    async def _resolve_emitter(self, workspace_id: str) -> tuple[dict, Workspace]:
        """Best-effort emitter (CedentePrestatore) snapshot from the workspace's
        VAT registry / settings. Full XML-mandatory validation happens at XML
        generation (later phase); here we snapshot what's configured."""
        ws = await self.db.get(Workspace, workspace_id)
        settings = (ws.settings or {}) if ws else {}
        emitter = {
            "legal_name": settings.get("company_name") or (ws.name if ws else None),
            "vat_id": settings.get("vat_number"),
            "tax_number": settings.get("tax_number"),
            "regime_fiscale": settings.get("regime_fiscale") or "RF01",
            "address": settings.get("address") or {},
            "bank": {},
        }
        if ws and ws.vat_registry_id:
            vr = await self.db.get(VatRegistry, ws.vat_registry_id)
            if vr:
                emitter["legal_name"] = vr.name or emitter["legal_name"]
                emitter["vat_id"] = vr.vat_number or emitter["vat_id"]
        iban = settings.get("iban")
        if iban:
            emitter["bank"] = {"iban": iban, "bic": settings.get("bic"), "account_name": emitter["legal_name"]}
        return emitter, ws

    async def _ensure_invoice_numerator(self, workspace_id: str, user_id: str | None) -> tuple[NumeratorService, Numerator]:
        ns = NumeratorService(self.db)
        res = await self.db.execute(
            select(Numerator).where(
                Numerator.workspace_id == workspace_id,
                Numerator.key == INVOICE_NUMERATOR_KEY,
                Numerator.deleted_at.is_(None),
            )
        )
        num = res.scalar_one_or_none()
        if num is None:
            num = await ns.create_numerator(
                workspace_id,
                NumeratorCreate(
                    key=INVOICE_NUMERATOR_KEY, name="Fatture attive",
                    include_year=True, separator="/", padding=4,
                    reset_policy="yearly", confirm_ttl_seconds=0,
                ),
                user_id=user_id,
            )
        return ns, num

    @staticmethod
    def _split_amounts(scadenze: list[dict], net_total: Decimal, vat_total: Decimal, grand_total: Decimal) -> list[dict]:
        """Split net/vat across scadenze proportionally to each gross amount, so
        Σnet = net_total, Σvat = vat_total and each record's total = its gross."""
        out = []
        acc_net = Decimal("0")
        n = len(scadenze)
        for i, s in enumerate(scadenze):
            gross = _q(s.get("amount") or "0")
            if i == n - 1:
                net = _q(net_total - acc_net)
            elif grand_total > 0:
                net = _q(net_total * gross / grand_total)
            else:
                net = gross
            acc_net += net
            out.append({"gross": gross, "net": net, "vat": _q(gross - net)})
        return out

    async def issue(
        self, workspace_id: str, document_id: str, user: User,
        member: WorkspaceMember | None = None,
    ) -> CollectionDocument:
        """Assign the definitive number, snapshot the emitter, create one actual
        ledger record per scadenza, and flip status to ``issued`` — all in the
        caller's transaction (the router commits), so any failure rolls back the
        numerator advance and leaves no gap."""
        doc = await self.get_invoice(workspace_id, document_id)
        data = dict(doc.data or {})
        lifecycle = dict(data.get("lifecycle") or {})
        if lifecycle.get("status") != "draft":
            raise ConflictException("La fattura non è in bozza: già emessa o annullata")

        customer = data.get("customer_snapshot") or {}
        if not customer.get("vat_id") and not customer.get("tax_number"):
            raise ValidationException(
                "Cliente senza P.IVA né codice fiscale: completare l'anagrafica prima di emettere"
            )
        if not data.get("lines"):
            raise ValidationException("La fattura non ha righe")

        now = datetime.utcnow()
        if not data.get("issue_date"):
            data["issue_date"] = now.date().isoformat()
        issue_date = date.fromisoformat(data["issue_date"])

        # Re-derive amounts/scadenze from the current content before issuing.
        data = self._recompute(data)
        totals = data["totals"]
        scadenze = list(data.get("payments", {}).get("scadenze") or [])
        if not scadenze:
            scadenze = [{"id": "sc1", "due_date": data["issue_date"], "amount": totals["grand_total"]}]
            data.setdefault("payments", {})["scadenze"] = scadenze

        emitter, ws = await self._resolve_emitter(workspace_id)
        data["emitter"] = emitter

        # Definitive number (immediate-issue numerator; rolls back with the txn).
        ns, num = await self._ensure_invoice_numerator(workspace_id, user.id)
        issued = await ns.reserve(workspace_id, num.id, user.id)
        data["number"] = issued.formatted
        data["numerator_id"] = num.id
        data["numerator_value"] = issued.value
        data["numerator_period"] = issued.period_key

        # One actual ledger record per scadenza (proportional net/vat split).
        record_svc = RecordService(self.db)
        splits = self._split_amounts(
            scadenze, _q(totals["tax_basis_total"]), _q(totals["tax_total"]), _q(totals["grand_total"])
        )
        account = (ws.settings or {}).get("default_sales_account") if ws else None
        account = account or "Vendite"
        legal_name = customer.get("legal_name") or "Cliente"
        record_ids: list[str] = []
        for s, sp in zip(scadenze, splits):
            rec = await record_svc.create_record(
                workspace_id,
                RecordCreate(
                    area="actual", type="Clienti", account=account, reference=legal_name,
                    date_cashflow=date.fromisoformat(s["due_date"]),
                    date_offer=issue_date,
                    date_document=issue_date,
                    amount=sp["net"], vat=sp["vat"], total=sp["gross"],
                    stage="0",
                    transaction_id=f"Fattura {issued.formatted}",
                    bank_account_id=(ws.bank_account_id if ws else None),
                    classification={
                        "counterpart_name": legal_name,
                        "counterpart_vat": customer.get("vat_id"),
                        "invoice_doc_id": document_id,
                        "scadenza_id": s.get("id"),
                    },
                ),
                user=user, member=member, skip_limit_check=True,
            )
            record_ids.append(rec.id)
            s["record_id"] = rec.id

        # Finalise lifecycle + links + content fingerprint.
        lifecycle["status"] = "issued"
        lifecycle["issued_at"] = now.isoformat()
        data["lifecycle"] = lifecycle
        links = dict(data.get("links") or {})
        links["actual_record_ids"] = record_ids
        data["links"] = links
        data["sync"] = {"data_fingerprint": compute_fingerprint(data), "last_synced_at": now.isoformat()}

        # Generate the e-invoice XML(s) for the required standards.
        from forecasto.services.einvoice_service import EInvoiceService

        einvoice_docs = await EInvoiceService(self.db).generate(
            workspace_id, {**data, "__document_id": document_id}, user_id=user.id
        )
        links["einvoice_doc_ids"] = [d.id for d in einvoice_docs]
        data["links"] = links

        return await self.collections.update_document(
            workspace_id, document_id,
            CollectionDocumentUpdate(title=f"Fattura {issued.formatted} — {legal_name}", data=data),
        )
