from __future__ import annotations

from decimal import Decimal

_CURRENCY_SYMBOLS = {
    "USD": "$",
    "SGD": "S$",
    "AED": "AED ",
}


def normalize_currency_code(code: str | None) -> str:
    normalized = (code or "USD").strip().upper()
    return normalized or "USD"


def format_currency(amount: Decimal | float | int | str | None, code: str | None) -> str:
    normalized_code = normalize_currency_code(code)
    try:
        value = Decimal(str(amount or 0))
    except Exception:
        value = Decimal("0")

    symbol = _CURRENCY_SYMBOLS.get(normalized_code, f"{normalized_code} ")
    return f"{symbol}{value.quantize(Decimal('0.01'))}"


def currency_symbol(code: str | None) -> str:
    normalized_code = normalize_currency_code(code)
    return _CURRENCY_SYMBOLS.get(normalized_code, f"{normalized_code} ")
