from __future__ import annotations

import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

from app.core.config import get_settings


@dataclass(frozen=True)
class XeroOAuthState:
    state: str
    authorization_url: str


class XeroAdapter:
    adapter_type = "accounting"
    provider_slug = "xero"
    display_name = "Xero"
    scopes = (
        "offline_access",
        "accounting.contacts.read",
        "accounting.transactions.read",
    )

    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def enabled(self) -> bool:
        return all([
            self.settings.XERO_CLIENT_ID,
            self.settings.XERO_CLIENT_SECRET,
            self.settings.XERO_REDIRECT_URI,
        ])

    def build_authorization_url(self, *, state: str | None = None) -> XeroOAuthState:
        nonce = state or secrets.token_urlsafe(24)
        query = urlencode({
            "response_type": "code",
            "client_id": self.settings.XERO_CLIENT_ID,
            "redirect_uri": self.settings.XERO_REDIRECT_URI,
            "scope": " ".join(self.scopes),
            "state": nonce,
        })
        return XeroOAuthState(
            state=nonce,
            authorization_url=f"https://login.xero.com/identity/connect/authorize?{query}",
        )

    def map_invoice_reference(self, invoice: dict) -> dict:
        return {
            "provider": "xero",
            "external_invoice_id": invoice.get("InvoiceID"),
            "invoice_number": invoice.get("InvoiceNumber"),
            "contact_name": (invoice.get("Contact") or {}).get("Name"),
            "status": invoice.get("Status"),
            "currency": invoice.get("CurrencyCode"),
            "total": invoice.get("Total"),
            "updated_at": invoice.get("UpdatedDateUTC"),
        }
