"""SDI FatturaPA XML parser for the inbox processing pipeline.

Parses Italian electronic invoices (FatturaElettronica XML) and P7M signed
envelopes, extracting structured data and formatting it as text for LLM
classification.

Ported from the TypeScript client-side parser: sdi-parser.ts
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

import defusedxml.ElementTree as ET

logger = logging.getLogger(__name__)


# --- Data classes ---


@dataclass
class SdiCedente:
    denominazione: str
    piva: str
    cf: str | None = None


@dataclass
class SdiCessionario:
    denominazione: str
    piva: str


@dataclass
class SdiLineaDettaglio:
    numero: int
    descrizione: str
    quantita: str | None
    unita_misura: str | None
    prezzo_unitario: str
    prezzo_totale: str
    aliquota_iva: str


@dataclass
class SdiRata:
    numero: int
    importo: Decimal
    scadenza: str  # YYYY-MM-DD
    iban: str | None = None


@dataclass
class SdiInvoice:
    filename: str
    tipo_documento: str  # TD01=fattura, TD04=nota credito, etc.
    numero: str
    data_emissione: str  # YYYY-MM-DD
    cedente: SdiCedente
    cessionario: SdiCessionario
    imponibile: Decimal
    aliquota_iva: str
    iva: Decimal
    totale: Decimal
    linee_dettaglio: list[SdiLineaDettaglio] = field(default_factory=list)
    rate: list[SdiRata] = field(default_factory=list)
    iban_pagamento: str | None = None  # IBAN consolidato del fornitore (prima rata con IBAN)


@dataclass
class SdiClassification:
    direction: str  # "in" or "out"
    counterpart_name: str
    counterpart_vat: str


# --- Helpers ---


def _find(elem: ET.Element | None, tag: str) -> ET.Element | None:
    """Find a direct child element by tag name (namespace-stripped)."""
    if elem is None:
        return None
    for child in elem:
        if child.tag == tag:
            return child
    return None


def _find_text(elem: ET.Element | None, tag: str, default: str = "") -> str:
    """Find a child element and return its text content."""
    child = _find(elem, tag)
    if child is not None and child.text:
        return child.text.strip()
    return default


def _find_all(elem: ET.Element | None, tag: str) -> list[ET.Element]:
    """Find all direct children with given tag name."""
    if elem is None:
        return []
    return [child for child in elem if child.tag == tag]


def _strip_namespaces(tree: ET.Element) -> None:
    """Remove namespace prefixes from all tags in-place."""
    for elem in tree.iter():
        if "}" in elem.tag:
            elem.tag = elem.tag.split("}", 1)[1]


def _parse_decimal(value: str, default: Decimal = Decimal("0")) -> Decimal:
    """Parse a string to Decimal, handling commas and invalid values."""
    if not value:
        return default
    value = value.replace(",", ".").replace("%", "").strip()
    try:
        return Decimal(value)
    except (InvalidOperation, ValueError):
        return default


def _add_days(date_str: str, days: int) -> str:
    """Add days to a YYYY-MM-DD date string."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        dt += timedelta(days=days)
        return dt.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return date_str


# --- Extraction functions ---


def _extract_cedente(header: ET.Element | None) -> SdiCedente:
    """Extract CedentePrestatore (seller/supplier) from FatturaElettronicaHeader."""
    cedente = _find(header, "CedentePrestatore")
    if cedente is None:
        return SdiCedente(denominazione="SCONOSCIUTO", piva="")

    dati_anag = _find(cedente, "DatiAnagrafici")
    anagrafica = _find(dati_anag, "Anagrafica")

    denominazione = _find_text(anagrafica, "Denominazione")
    if not denominazione:
        nome = _find_text(anagrafica, "Nome")
        cognome = _find_text(anagrafica, "Cognome")
        if nome or cognome:
            denominazione = f"{cognome} {nome}".strip()

    # P.IVA
    piva = ""
    id_fiscale = _find(dati_anag, "IdFiscaleIVA")
    if id_fiscale is not None:
        id_codice = _find_text(id_fiscale, "IdCodice")
        id_paese = _find_text(id_fiscale, "IdPaese", "IT")
        if id_codice:
            piva = id_codice if id_codice.startswith(id_paese) else f"{id_paese}{id_codice}"

    cf = _find_text(dati_anag, "CodiceFiscale") or None

    return SdiCedente(
        denominazione=(denominazione or "SCONOSCIUTO").upper(),
        piva=piva,
        cf=cf,
    )


def _extract_cessionario(header: ET.Element | None) -> SdiCessionario:
    """Extract CessionarioCommittente (buyer/customer) from FatturaElettronicaHeader."""
    cessionario = _find(header, "CessionarioCommittente")
    if cessionario is None:
        return SdiCessionario(denominazione="SCONOSCIUTO", piva="")

    dati_anag = _find(cessionario, "DatiAnagrafici")
    anagrafica = _find(dati_anag, "Anagrafica")

    denominazione = _find_text(anagrafica, "Denominazione")
    if not denominazione:
        nome = _find_text(anagrafica, "Nome")
        cognome = _find_text(anagrafica, "Cognome")
        if nome or cognome:
            denominazione = f"{cognome} {nome}".strip()

    piva = ""
    id_fiscale = _find(dati_anag, "IdFiscaleIVA")
    if id_fiscale is not None:
        id_codice = _find_text(id_fiscale, "IdCodice")
        id_paese = _find_text(id_fiscale, "IdPaese", "IT")
        if id_codice:
            piva = id_codice if id_codice.startswith(id_paese) else f"{id_paese}{id_codice}"

    return SdiCessionario(
        denominazione=(denominazione or "SCONOSCIUTO").strip(),
        piva=piva,
    )


def _extract_importi(
    body: ET.Element,
) -> tuple[Decimal, str, Decimal, Decimal]:
    """Extract amounts from FatturaElettronicaBody.

    Returns (imponibile, aliquota_iva, iva, totale).
    """
    dati_beni = _find(body, "DatiBeniServizi")
    dati_gen = _find(body, "DatiGenerali")
    dati_doc = _find(dati_gen, "DatiGeneraliDocumento")

    imponibile = Decimal("0")
    iva = Decimal("0")
    aliquota_iva = "22"

    if dati_beni is not None:
        riepilogo_list = _find_all(dati_beni, "DatiRiepilogo")

        if riepilogo_list:
            # Sum all DatiRiepilogo entries (handles multiple VAT rates)
            for riepilogo in riepilogo_list:
                imponibile += _parse_decimal(_find_text(riepilogo, "ImponibileImporto"))
                iva += _parse_decimal(_find_text(riepilogo, "Imposta"))

            # Use first non-zero aliquota
            for riepilogo in riepilogo_list:
                aliq = _find_text(riepilogo, "AliquotaIVA")
                if aliq and _parse_decimal(aliq) > 0:
                    aliquota_iva = aliq
                    break
        else:
            # Fallback: sum DettaglioLinee
            righe = _find_all(dati_beni, "DettaglioLinee")
            for riga in righe:
                imponibile += _parse_decimal(_find_text(riga, "PrezzoTotale"))
            if righe:
                aliquota_iva = _find_text(righe[0], "AliquotaIVA", "22")
            iva = imponibile * _parse_decimal(aliquota_iva) / Decimal("100")

    # Totale documento
    importo_totale_str = _find_text(dati_doc, "ImportoTotaleDocumento")
    if importo_totale_str:
        totale = _parse_decimal(importo_totale_str)
    else:
        totale = imponibile + iva

    # Clean aliquota
    aliquota_clean = aliquota_iva.replace("%", "").replace(",", ".").strip()
    try:
        aliquota_float = float(aliquota_clean)
        if aliquota_float != aliquota_float or aliquota_float > 100:  # NaN or >100
            aliquota_float = 22.0
        aliquota_iva = str(int(aliquota_float)) if aliquota_float == int(aliquota_float) else str(aliquota_float)
    except (ValueError, TypeError):
        aliquota_iva = "22"

    return imponibile, aliquota_iva, iva, totale


def _extract_linee_dettaglio(body: ET.Element) -> list[SdiLineaDettaglio]:
    """Extract all DettaglioLinee (line items) from FatturaElettronicaBody."""
    dati_beni = _find(body, "DatiBeniServizi")
    if dati_beni is None:
        return []

    linee = []
    for riga in _find_all(dati_beni, "DettaglioLinee"):
        linee.append(SdiLineaDettaglio(
            numero=int(_find_text(riga, "NumeroLinea", "0")),
            descrizione=_find_text(riga, "Descrizione"),
            quantita=_find_text(riga, "Quantita") or None,
            unita_misura=_find_text(riga, "UnitaMisura") or None,
            prezzo_unitario=_find_text(riga, "PrezzoUnitario", "0"),
            prezzo_totale=_find_text(riga, "PrezzoTotale", "0"),
            aliquota_iva=_find_text(riga, "AliquotaIVA", "22"),
        ))
    return linee


def _normalize_iban(raw: str) -> str | None:
    """Normalize an IBAN string: strip spaces, uppercase. Returns None if invalid/empty.

    Accepts IBANs of any country (Italian or foreign). Doesn't validate the
    check digits — it's the LLM/user's responsibility to recognize garbage.
    """
    if not raw:
        return None
    cleaned = raw.replace(" ", "").replace("\t", "").replace("\n", "").upper()
    if len(cleaned) < 15 or len(cleaned) > 34:
        return None
    return cleaned


def _extract_rate(
    body: ET.Element, data_emissione: str, totale: Decimal
) -> list[SdiRata]:
    """Extract payment installments from DatiPagamento."""
    # Collect all DettaglioPagamento from all DatiPagamento sections
    all_dettagli: list[ET.Element] = []
    for dati_pag in _find_all(body, "DatiPagamento"):
        all_dettagli.extend(_find_all(dati_pag, "DettaglioPagamento"))

    if len(all_dettagli) > 1:
        # Multiple installments
        return [
            SdiRata(
                numero=idx + 1,
                importo=_parse_decimal(_find_text(det, "ImportoPagamento", "0")),
                scadenza=_find_text(det, "DataScadenzaPagamento", ""),
                iban=_normalize_iban(_find_text(det, "IBAN")),
            )
            for idx, det in enumerate(all_dettagli)
        ]

    if len(all_dettagli) == 1:
        det = all_dettagli[0]
        importo_str = _find_text(det, "ImportoPagamento") or str(totale)
        scadenza = _find_text(det, "DataScadenzaPagamento")
        return [
            SdiRata(
                numero=1,
                importo=_parse_decimal(importo_str, totale),
                scadenza=scadenza or (
                    _add_days(data_emissione, 30) if data_emissione else ""
                ),
                iban=_normalize_iban(_find_text(det, "IBAN")),
            )
        ]

    # No payment details: single installment with totale and date_doc+30
    return [
        SdiRata(
            numero=1,
            importo=totale,
            scadenza=_add_days(data_emissione, 30) if data_emissione else "",
        )
    ]


# --- Main parser ---


def parse_sdi_xml(xml_content: str, filename: str) -> SdiInvoice:
    """Parse a FatturaPA XML string into an SdiInvoice.

    Handles all common namespace variants (p:, ns3:, bare).
    Uses defusedxml for secure parsing.
    """
    root = ET.fromstring(xml_content)
    _strip_namespaces(root)

    # Navigate to FatturaElettronica root
    # It might be the root itself or we may need to find it
    if root.tag != "FatturaElettronica":
        # Check if it's a wrapper
        fe = _find(root, "FatturaElettronica")
        if fe is not None:
            root = fe
        elif "FatturaElettronica" not in root.tag:
            raise ValueError("Struttura FatturaElettronica non trovata nel file XML")

    header = _find(root, "FatturaElettronicaHeader")

    # Handle multiple bodies (rare) - take the first
    bodies = _find_all(root, "FatturaElettronicaBody")
    if not bodies:
        raise ValueError("FatturaElettronicaBody non trovato")
    body = bodies[0]

    dati_gen = _find(body, "DatiGenerali")
    dati_doc = _find(dati_gen, "DatiGeneraliDocumento")

    tipo_documento = _find_text(dati_doc, "TipoDocumento", "TD01")
    numero = _find_text(dati_doc, "Numero", "")
    data_emissione = _find_text(dati_doc, "Data", "")

    cedente = _extract_cedente(header)
    cessionario = _extract_cessionario(header)
    imponibile, aliquota_iva, iva, totale = _extract_importi(body)
    linee_dettaglio = _extract_linee_dettaglio(body)
    rate = _extract_rate(body, data_emissione, totale)

    # TD04 = nota di credito -> invert signs
    is_nota_credito = tipo_documento == "TD04"
    if is_nota_credito:
        imponibile = -imponibile
        iva = -iva
        totale = -totale
        rate = [
            SdiRata(
                numero=r.numero,
                importo=-r.importo,
                scadenza=r.scadenza,
                iban=r.iban,
            )
            for r in rate
        ]

    # Consolidated IBAN: first non-empty across installments. When multiple
    # installments declare different IBANs (rare), the per-rata IBAN is used
    # in format_invoice_for_llm.
    iban_pagamento = next((r.iban for r in rate if r.iban), None)

    return SdiInvoice(
        filename=filename,
        tipo_documento=tipo_documento,
        numero=numero,
        data_emissione=data_emissione,
        cedente=cedente,
        cessionario=cessionario,
        imponibile=imponibile,
        aliquota_iva=aliquota_iva,
        iva=iva,
        totale=totale,
        linee_dettaglio=linee_dettaglio,
        rate=rate,
        iban_pagamento=iban_pagamento,
    )


# --- Classification ---


def classify_invoice(
    invoice: SdiInvoice, workspace_vat: str
) -> SdiClassification:
    """Classify invoice as active (income) or passive (expense).

    Same logic as classifyInvoice() in sdi-parser.ts:
    - If workspace VAT matches cedente (seller) -> direction "in" (active, we are the seller)
    - If workspace VAT matches cessionario (buyer) -> direction "out" (passive, we are the buyer)
    - Default: "out" (passive)
    """
    normalized_ws = workspace_vat.replace(" ", "").upper()
    cedente_vat = invoice.cedente.piva.replace(" ", "").upper()
    cessionario_vat = invoice.cessionario.piva.replace(" ", "").upper()

    # Workspace is the seller -> active invoice (income)
    if cedente_vat and cedente_vat == normalized_ws:
        return SdiClassification(
            direction="in",
            counterpart_name=invoice.cessionario.denominazione,
            counterpart_vat=invoice.cessionario.piva,
        )

    # Workspace is the buyer -> passive invoice (expense)
    if cessionario_vat and cessionario_vat == normalized_ws:
        return SdiClassification(
            direction="out",
            counterpart_name=invoice.cedente.denominazione,
            counterpart_vat=invoice.cedente.piva,
        )

    # Default: passive
    return SdiClassification(
        direction="out",
        counterpart_name=invoice.cedente.denominazione,
        counterpart_vat=invoice.cedente.piva,
    )


# --- Format for LLM ---


_TIPO_DOC_LABELS = {
    "TD01": "Fattura",
    "TD02": "Acconto/anticipo su fattura",
    "TD03": "Acconto/anticipo su parcella",
    "TD04": "Nota di credito",
    "TD05": "Nota di debito",
    "TD06": "Parcella",
    "TD16": "Integrazione fattura reverse charge interno",
    "TD17": "Integrazione/autofattura acquisto servizi estero",
    "TD18": "Integrazione acquisto beni intracomunitari",
    "TD19": "Integrazione/autofattura acquisto beni art.17 c.2 DPR 633/72",
    "TD20": "Autofattura/regolarizzazione",
    "TD24": "Fattura differita art.21 c.4 lett.a",
    "TD25": "Fattura differita art.21 c.4 terzo periodo lett.b",
    "TD26": "Cessione beni ammortizzabili / passaggi interni",
    "TD27": "Fattura per autoconsumo o cessioni gratuite",
}


def format_invoice_for_llm(
    invoice: SdiInvoice, classification: SdiClassification
) -> str:
    """Format parsed invoice data as structured text for LLM processing.

    The LLM receives this text instead of an image, saving vision tokens
    while providing exact numeric data from the XML.
    """
    tipo_label = _TIPO_DOC_LABELS.get(invoice.tipo_documento, invoice.tipo_documento)

    direction_label = (
        "ATTIVA (il workspace e' il cedente/fornitore -> fattura di vendita, importi positivi)"
        if classification.direction == "in"
        else "PASSIVA (il workspace e' il cessionario/cliente -> fattura di acquisto, importi negativi)"
    )

    lines = [
        f"FATTURA ELETTRONICA ({invoice.tipo_documento} - {tipo_label})",
        f"Numero: {invoice.numero}",
        f"Data emissione: {invoice.data_emissione}",
        "",
        "CEDENTE (Fornitore):",
        f"  Denominazione: {invoice.cedente.denominazione}",
        f"  P.IVA: {invoice.cedente.piva}",
    ]
    if invoice.cedente.cf:
        lines.append(f"  CF: {invoice.cedente.cf}")

    lines += [
        "",
        "CESSIONARIO (Cliente):",
        f"  Denominazione: {invoice.cessionario.denominazione}",
        f"  P.IVA: {invoice.cessionario.piva}",
        "",
        "CLASSIFICAZIONE:",
        f"  Direzione: {direction_label}",
        f"  Controparte: {classification.counterpart_name} (P.IVA {classification.counterpart_vat})",
    ]

    # Summary amounts — shown BEFORE content so the LLM anchors on totals first
    lines += [
        "",
        "RIEPILOGO IMPORTI (documento complessivo):",
        f"  Imponibile: {invoice.imponibile}",
        f"  IVA ({invoice.aliquota_iva}%): {invoice.iva}",
        f"  Totale documento: {invoice.totale}",
    ]

    # Aggregated content summary — line items are informational only, NEVER split criteria
    if invoice.linee_dettaglio:
        lines += [
            "",
            "CONTENUTO (informativo per scegliere account/note — NON scomporre per riga):",
            f"  Numero righe: {len(invoice.linee_dettaglio)}",
        ]
        if len(invoice.linee_dettaglio) <= 3:
            for linea in invoice.linee_dettaglio:
                lines.append(
                    f"  - riga {linea.numero}: {linea.descrizione} (totale {linea.prezzo_totale})"
                )
        else:
            sorted_lines = sorted(
                invoice.linee_dettaglio,
                key=lambda l: _parse_decimal(l.prezzo_totale),
                reverse=True,
            )
            for linea in sorted_lines[:3]:
                lines.append(
                    f"  - {linea.descrizione} (totale {linea.prezzo_totale})"
                )
            rest = len(invoice.linee_dettaglio) - 3
            rest_label = "altra 1 riga minore" if rest == 1 else f"altre {rest} righe minori"
            lines.append(f"  - ... e {rest_label}")

    # Payment installments — prominent header + pre-calculated proportional amounts
    n_rate = len(invoice.rate)
    totale = invoice.totale

    # Detect heterogeneous IBANs across installments (rare). When detected,
    # show the IBAN inline per installment instead of a single consolidated
    # IBAN block at the end.
    distinct_ibans = {r.iban for r in invoice.rate if r.iban}
    iban_per_rata = len(distinct_ibans) > 1

    if n_rate >= 2 and totale > 0:
        lines += [
            "",
            f"RATE DI PAGAMENTO (CREA {n_rate} RECORD, UNO PER OGNI RATA):",
        ]
        for rata in invoice.rate:
            imp_rata = (invoice.imponibile * rata.importo / totale).quantize(Decimal("0.01"))
            iva_rata = (invoice.iva * rata.importo / totale).quantize(Decimal("0.01"))
            scadenza = rata.scadenza or (
                _add_days(invoice.data_emissione, 30)
                if invoice.data_emissione
                else "da definire"
            )
            iban_suffix = f" - IBAN: {rata.iban}" if (iban_per_rata and rata.iban) else ""
            lines.append(
                f"  Rata {rata.numero}/{n_rate}: "
                f"imponibile {imp_rata} + IVA {iva_rata} = totale {rata.importo} EUR "
                f"- Scadenza: {scadenza}{iban_suffix}"
            )
    elif n_rate == 1:
        rata = invoice.rate[0]
        scadenza = rata.scadenza or (
            _add_days(invoice.data_emissione, 30)
            if invoice.data_emissione
            else "da definire"
        )
        lines += [
            "",
            "RATA UNICA (CREA 1 RECORD):",
            f"  Imponibile {invoice.imponibile} + IVA {invoice.iva} = totale {rata.importo} EUR - Scadenza: {scadenza}",
        ]
    else:
        scadenza = (
            _add_days(invoice.data_emissione, 30)
            if invoice.data_emissione
            else "da definire"
        )
        lines += [
            "",
            "PAGAMENTO NON SPECIFICATO (CREA 1 RECORD):",
            f"  Imponibile {invoice.imponibile} + IVA {invoice.iva} = totale {invoice.totale} EUR - Scadenza stimata: {scadenza}",
        ]

    # IBAN del fornitore — emesso SOLO per fatture passive (workspace = cessionario).
    # Per le attive l'IBAN sarebbe il nostro: ridondante e fonte di rumore.
    if classification.direction == "out" and invoice.iban_pagamento:
        if iban_per_rata:
            lines += [
                "",
                "IBAN PAGAMENTO FORNITORE (DA INCLUDERE NELLA NOTE DI OGNI RECORD):",
                "  Le rate dichiarano IBAN diversi (vedi sopra rata per rata).",
                "  Per OGNI record generato appendi alla note una riga finale nel formato",
                "  \"IBAN: <IBAN della rata corrispondente>\".",
            ]
        else:
            lines += [
                "",
                "IBAN PAGAMENTO FORNITORE (DA INCLUDERE NELLA NOTE DI OGNI RECORD):",
                f"  {invoice.iban_pagamento}",
                f"  Per OGNI record generato da questa fattura appendi alla note una",
                f"  riga finale nel formato \"IBAN: {invoice.iban_pagamento}\".",
            ]

    return "\n".join(lines)


# --- P7M extraction ---


def extract_xml_from_p7m(p7m_bytes: bytes) -> str:
    """Extract XML content from a P7M (PKCS#7 / CMS signed) file.

    Uses asn1crypto to parse the DER-encoded PKCS#7 structure and extract
    the encapsulated content (the original XML).
    """
    from asn1crypto import cms

    content_info = cms.ContentInfo.load(p7m_bytes)
    signed_data = content_info["content"]
    encap_content_info = signed_data["encap_content_info"]
    content = encap_content_info["content"].native

    if isinstance(content, bytes):
        # Try UTF-8 first, fall back to ISO-8859-1
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return content.decode("iso-8859-1")
    return str(content)


def decode_xml_bytes(file_bytes: bytes) -> str:
    """Decode XML file bytes to string, handling encoding detection."""
    # Check for XML declaration encoding
    head = file_bytes[:200]
    encoding_match = re.search(rb'encoding=["\']([^"\']+)["\']', head)
    if encoding_match:
        encoding = encoding_match.group(1).decode("ascii")
        try:
            return file_bytes.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            pass

    # Try UTF-8, fall back to ISO-8859-1
    try:
        return file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return file_bytes.decode("iso-8859-1")
