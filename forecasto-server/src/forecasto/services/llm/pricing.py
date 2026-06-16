"""Shared LLM pricing helpers (EUR), used for non-document features.

Document processing has its own DB-driven pricing (LLMPricingConfig); these
constants cover the lightweight "service" features (prompt builder, Agente-zero)
that bill in EUR. Prices are Anthropic USD/MTok converted at ~0.92.
"""

from __future__ import annotations

_USD_TO_EUR = 0.92

# (input_usd_per_mtok, output_usd_per_mtok)
_PRICES_USD_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5-20251001": (0.80, 4.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-4-8": (15.00, 75.00),
}

# Fallback when the model isn't in the table.
_DEFAULT_PRICE_USD_PER_MTOK = (0.80, 4.00)


def cost_eur(model: str, input_tokens: int, output_tokens: int) -> float:
    """Return the EUR cost for a call, rounded to 6 decimals."""
    in_usd, out_usd = _PRICES_USD_PER_MTOK.get(model, _DEFAULT_PRICE_USD_PER_MTOK)
    cost = (
        input_tokens * in_usd * _USD_TO_EUR / 1_000_000
        + output_tokens * out_usd * _USD_TO_EUR / 1_000_000
    )
    return round(cost, 6)
