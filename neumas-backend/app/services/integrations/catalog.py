from __future__ import annotations

from app.schemas.integrations import IntegrationConnectionResponse


def integration_catalog() -> list[IntegrationConnectionResponse]:
    return [
        IntegrationConnectionResponse(
            adapter_type="pos",
            provider_slug="storehub",
            display_name="StoreHub",
            status="not_connected",
            health_status="unknown",
            implemented=False,
            coming_soon=True,
        ),
        IntegrationConnectionResponse(
            adapter_type="pos",
            provider_slug="qashier",
            display_name="Qashier",
            status="not_connected",
            health_status="unknown",
            implemented=False,
            coming_soon=True,
        ),
        IntegrationConnectionResponse(
            adapter_type="receipt_source",
            provider_slug="email-receipt-import",
            display_name="Email receipt import",
            status="not_connected",
            health_status="unknown",
            implemented=False,
            coming_soon=True,
        ),
        IntegrationConnectionResponse(
            adapter_type="commerce",
            provider_slug="grocery-partner-connections",
            display_name="Grocery partner connections",
            status="not_connected",
            health_status="unknown",
            implemented=False,
            coming_soon=True,
        ),
    ]
