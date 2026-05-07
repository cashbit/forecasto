"""VAT computation utilities used by the inbox confirmation flow.

When a bank statement / wire transfer line matches an open order in Forecasto,
the confirmation step needs to recompute the imponibile (amount, net of VAT)
from the wire transfer's total (which is gross of VAT). This module centralizes
that arithmetic so the reverse is consistent everywhere.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP


_TWO_PLACES = Decimal("0.01")


def recompute_vat_from_total(
    total: Decimal,
    vat_rate: Decimal | None,
) -> tuple[Decimal, Decimal]:
    """Split a gross total into (amount, vat) given a VAT rate.

    - ``total`` is the gross amount (IVA-inclusive). Negative for outflows.
    - ``vat_rate`` is fractional (e.g. ``Decimal("0.22")`` for 22%). ``None``
      or ``0`` means VAT-exempt (reverse charge, fuori campo, esente): the
      whole total is the imponibile and VAT is zero.

    Returns ``(amount, vat)`` where ``amount + vat == total`` (within rounding)
    and the sign of ``total`` is preserved on both components.

    Quantizes to 2 decimal places using HALF_UP rounding.
    """
    if total is None:
        return Decimal("0"), Decimal("0")
    total = Decimal(total)

    if vat_rate is None or vat_rate == 0:
        return total.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP), Decimal("0.00")

    rate = Decimal(vat_rate)
    amount = (total / (Decimal("1") + rate)).quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)
    vat = (total - amount).quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)
    return amount, vat


def infer_vat_rate(amount: Decimal | None, vat: Decimal | None) -> Decimal | None:
    """Best-effort: derive the VAT rate from an existing record's amount/vat.

    Returns ``None`` if amount is missing or zero (cannot infer a meaningful
    rate). Returns ``Decimal("0")`` if amount is non-zero but VAT is zero
    (treated as VAT-exempt).
    """
    if amount is None or amount == 0:
        return None
    if vat is None:
        return None
    return (Decimal(vat) / Decimal(amount))
