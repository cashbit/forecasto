"""VIES — EU VAT number validation & name/address lookup.

Uses the official VIES REST API (which superseded the legacy SOAP service):
``GET https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{cc}/vat/{vat}``.
For valid numbers many member states return the registered name and address.

Network/service failures degrade gracefully: we return ``valid=None`` with an
``error`` message and never raise, so a lookup can never block invoice work.
"""

from __future__ import annotations

import logging
import re

import httpx

from forecasto.schemas.customer import CustomerAddress, ViesLookupResponse

logger = logging.getLogger(__name__)

_VIES_BASE = "https://ec.europa.eu/taxation_customs/vies/rest-api/ms"
_TIMEOUT = 10.0


def normalize_vat(country_code: str | None, vat: str | None) -> tuple[str | None, str | None]:
    """Return ``(country_code, vat_number)`` cleaned and uppercased.

    Accepts a VAT that already carries its 2-letter country prefix (the prefix
    wins over the passed ``country_code``). Strips spaces, dots and dashes.
    """
    if not vat:
        return (country_code or "").upper() or None, None
    cleaned = re.sub(r"[\s.\-]", "", vat).upper()
    m = re.match(r"^([A-Z]{2})(.+)$", cleaned)
    if m:
        return m.group(1), m.group(2)
    return (country_code or "").upper() or None, cleaned


def _parse_address_it(raw: str | None) -> CustomerAddress:
    """Best-effort split of a VIES address blob into structured fields (IT format).

    Typical IT shape: ``"VIA ROMA 1\n16100 GENOVA GE"``. Unknown shapes fall back
    to putting the whole blob in ``line_one`` — the user edits before saving.
    """
    addr = CustomerAddress()
    if not raw:
        return addr
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    if not lines:
        return addr
    addr.line_one = lines[0]
    if len(lines) >= 2:
        # "CAP CITY PROV" — CAP is 5 digits, PROV is a trailing 2-letter token.
        m = re.match(r"^(\d{5})\s+(.+?)(?:\s+([A-Z]{2}))?$", lines[1])
        if m:
            addr.postcode = m.group(1)
            addr.city = m.group(2).strip()
            addr.province = m.group(3)
        else:
            addr.line_two = lines[1]
    return addr


class ViesService:
    """Stateless VIES client."""

    async def lookup(self, country_code: str, vat_number: str) -> ViesLookupResponse:
        cc, vat = normalize_vat(country_code, vat_number)
        cc = cc or country_code
        vat = vat or vat_number
        url = f"{_VIES_BASE}/{cc}/vat/{vat}"
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.get(url, headers={"Accept": "application/json"})
            if resp.status_code != 200:
                return ViesLookupResponse(
                    valid=None, country_code=cc, vat_number=vat,
                    error=f"VIES HTTP {resp.status_code}",
                )
            payload = resp.json()
        except Exception as exc:  # network, timeout, JSON, etc.
            logger.warning("VIES lookup failed for %s%s: %s", cc, vat, exc)
            return ViesLookupResponse(
                valid=None, country_code=cc, vat_number=vat, error=str(exc),
            )

        # The REST API uses ``isValid``; tolerate the legacy ``valid`` key too.
        valid = payload.get("isValid")
        if valid is None:
            valid = payload.get("valid")
        raw_name = (payload.get("name") or "").strip() or None
        raw_address = (payload.get("address") or "").strip() or None
        address = _parse_address_it(raw_address) if cc == "IT" else CustomerAddress(
            line_one=raw_address, country_code=cc,
        )
        if not address.country_code:
            address.country_code = cc
        return ViesLookupResponse(
            valid=valid,
            country_code=cc,
            vat_number=vat,
            name=raw_name,
            address=address,
            raw_name=raw_name,
            raw_address=raw_address,
        )
