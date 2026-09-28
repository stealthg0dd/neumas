from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.logging import get_logger
from app.db.repositories.audit_logs import AuditLogsRepository
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.agent_commerce import (
    INITIAL_AGENT_COMMERCE_SCOPES,
    ApiCredentialCreate,
    ApiCredentialResponse,
    AvailabilityExternal,
    CatalogItemExternal,
    ExternalPrincipal,
    GeneratedApiCredential,
    OfferExternal,
    ServiceClientCreate,
    ServiceClientResponse,
    SupplierExternal,
)

logger = get_logger(__name__)


class AgentCommerceAuthError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 401) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class AgentCommerceService:
    def __init__(self) -> None:
        self.audit = AuditLogsRepository()

    async def create_service_client(self, tenant: TenantContext, payload: ServiceClientCreate) -> ServiceClientResponse:
        scopes = self._valid_scopes(payload.allowed_scopes)
        client = await get_async_supabase_admin()
        resp = await client.table("service_clients").insert({
            "organization_id": str(tenant.org_id),
            "name": payload.name,
            "description": payload.description,
            "allowed_scopes": scopes,
            "allowed_property_ids": [str(item) for item in payload.allowed_property_ids],
            "allowed_supplier_ids": [str(item) for item in payload.allowed_supplier_ids],
            "allowed_categories": payload.allowed_categories,
            "spend_limit": str(payload.spend_limit) if payload.spend_limit is not None else None,
            "created_by_id": str(tenant.user_id),
        }).execute()
        row = resp.data[0]
        await client.table("agent_identities").insert({
            "organization_id": str(tenant.org_id),
            "service_client_id": row["id"],
            "display_name": payload.name,
            "agent_type": "buyer_agent",
            "metadata": {"source": "developer_ui"},
        }).execute()
        await self.audit.log(tenant, "agent_commerce.service_client_created", "service_clients", resource_id=row["id"], metadata={"scopes": scopes})
        return self._service_client(row)

    async def list_service_clients(self, tenant: TenantContext) -> list[ServiceClientResponse]:
        client = await get_async_supabase_admin()
        resp = await (
            client.table("service_clients")
            .select("*")
            .eq("organization_id", str(tenant.org_id))
            .order("created_at", desc=True)
            .execute()
        )
        return [self._service_client(row) for row in resp.data or []]

    async def list_credentials(self, tenant: TenantContext, service_client_id: UUID | None = None) -> list[ApiCredentialResponse]:
        client = await get_async_supabase_admin()
        query = client.table("api_credentials").select("*").eq("organization_id", str(tenant.org_id)).order("created_at", desc=True)
        if service_client_id:
            query = query.eq("service_client_id", str(service_client_id))
        resp = await query.execute()
        return [self._credential(row) for row in resp.data or []]

    async def generate_credential(self, tenant: TenantContext, service_client_id: UUID, payload: ApiCredentialCreate) -> GeneratedApiCredential:
        client = await get_async_supabase_admin()
        service_resp = await (
            client.table("service_clients")
            .select("*")
            .eq("id", str(service_client_id))
            .eq("organization_id", str(tenant.org_id))
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        if not service_resp.data:
            raise ValueError("Service client not found")
        service_client = service_resp.data[0]
        allowed = set(service_client.get("allowed_scopes") or [])
        scopes = self._valid_scopes(payload.scopes)
        if not set(scopes).issubset(allowed):
            raise ValueError("Credential scopes exceed service client scopes")

        prefix = secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:10]
        secret = secrets.token_urlsafe(32)
        api_key = f"nac_{prefix}_{secret}"
        resp = await client.table("api_credentials").insert({
            "organization_id": str(tenant.org_id),
            "service_client_id": str(service_client_id),
            "credential_prefix": prefix,
            "credential_hash": self.hash_api_key(api_key),
            "name": payload.name,
            "scopes": scopes,
            "expires_at": payload.expires_at.isoformat() if payload.expires_at else None,
            "created_by_id": str(tenant.user_id),
        }).execute()
        row = resp.data[0]
        await client.table("delegations").insert({
            "organization_id": str(tenant.org_id),
            "service_client_id": str(service_client_id),
            "scopes": scopes,
            "property_ids": service_client.get("allowed_property_ids") or [],
            "supplier_ids": service_client.get("allowed_supplier_ids") or [],
            "categories": service_client.get("allowed_categories") or [],
            "spend_limit": service_client.get("spend_limit"),
            "expires_at": payload.expires_at.isoformat() if payload.expires_at else None,
            "created_by_id": str(tenant.user_id),
        }).execute()
        await self.audit.log(tenant, "agent_commerce.credential_generated", "api_credentials", resource_id=row["id"], metadata={"credential_prefix": prefix, "scopes": scopes})
        return GeneratedApiCredential(**self._credential(row).model_dump(), api_key=api_key)

    async def revoke_credential(self, tenant: TenantContext, credential_id: UUID) -> ApiCredentialResponse:
        client = await get_async_supabase_admin()
        now = datetime.now(UTC).isoformat()
        existing = await (
            client.table("api_credentials")
            .select("*")
            .eq("id", str(credential_id))
            .eq("organization_id", str(tenant.org_id))
            .limit(1)
            .execute()
        )
        if not existing.data:
            raise ValueError("Credential not found")
        resp = await (
            client.table("api_credentials")
            .update({"revoked_at": now})
            .eq("id", str(credential_id))
            .eq("organization_id", str(tenant.org_id))
            .execute()
        )
        row = (resp.data or [{**existing.data[0], "revoked_at": now}])[0]
        await self.audit.log(tenant, "agent_commerce.credential_revoked", "api_credentials", resource_id=str(credential_id), metadata={"credential_prefix": row.get("credential_prefix")})
        return self._credential(row)

    async def authenticate(self, api_key: str) -> ExternalPrincipal:
        prefix = self.extract_prefix(api_key)
        if not prefix:
            raise AgentCommerceAuthError("invalid_api_key", "Invalid API credential")
        client = await get_async_supabase_admin()
        resp = await (
            client.table("api_credentials")
            .select("*,service_client:service_clients(*)")
            .eq("credential_prefix", prefix)
            .limit(1)
            .execute()
        )
        if not resp.data:
            raise AgentCommerceAuthError("invalid_api_key", "Invalid API credential")
        credential = resp.data[0]
        if credential.get("revoked_at"):
            raise AgentCommerceAuthError("credential_revoked", "API credential has been revoked", 403)
        expires_at = credential.get("expires_at")
        if expires_at and datetime.fromisoformat(str(expires_at).replace("Z", "+00:00")) <= datetime.now(UTC):
            raise AgentCommerceAuthError("credential_expired", "API credential has expired", 403)
        if not hmac.compare_digest(str(credential.get("credential_hash") or ""), self.hash_api_key(api_key)):
            raise AgentCommerceAuthError("invalid_api_key", "Invalid API credential")
        service_client = credential.get("service_client")
        if isinstance(service_client, list):
            service_client = service_client[0] if service_client else {}
        if not isinstance(service_client, dict) or service_client.get("status") != "active" or service_client.get("revoked_at"):
            raise AgentCommerceAuthError("service_client_revoked", "Service client is not active", 403)
        await (
            client.table("api_credentials")
            .update({"last_used_at": datetime.now(UTC).isoformat()})
            .eq("id", credential["id"])
            .execute()
        )
        org_id = UUID(str(credential["organization_id"]))
        principal = ExternalPrincipal(
            organization_id=org_id,
            service_client_id=UUID(str(credential["service_client_id"])),
            credential_id=UUID(str(credential["id"])),
            credential_prefix=str(credential["credential_prefix"]),
            scopes=list(credential.get("scopes") or []),
            allowed_property_ids=[UUID(str(item)) for item in service_client.get("allowed_property_ids") or []],
            allowed_supplier_ids=[UUID(str(item)) for item in service_client.get("allowed_supplier_ids") or []],
            allowed_categories=[str(item) for item in service_client.get("allowed_categories") or []],
            spend_limit=Decimal(str(service_client["spend_limit"])) if service_client.get("spend_limit") is not None else None,
        )
        await self.audit.log_admin(
            org_id=str(org_id),
            user_id=str(principal.service_client_id),
            action="agent_commerce.credential_used",
            resource_type="api_credentials",
            resource_id=str(principal.credential_id),
            actor_role="service",
            metadata={"credential_prefix": principal.credential_prefix},
        )
        return principal

    async def list_suppliers(self, principal: ExternalPrincipal, *, limit: int, offset: int) -> list[SupplierExternal]:
        client = await get_async_supabase_admin()
        query = client.table("vendors").select("*").eq("organization_id", str(principal.organization_id)).eq("is_active", True).order("name").range(offset, offset + limit - 1)
        rows = await query.execute()
        suppliers = [row for row in rows.data or [] if self._supplier_allowed(principal, row.get("id"))]
        performance = await self._performance_by_supplier(principal)
        return [self._supplier(row, performance.get(str(row.get("id")))) for row in suppliers]

    async def get_supplier(self, principal: ExternalPrincipal, supplier_id: UUID) -> SupplierExternal | None:
        if not self._supplier_allowed(principal, str(supplier_id)):
            return None
        client = await get_async_supabase_admin()
        resp = await (
            client.table("vendors")
            .select("*")
            .eq("organization_id", str(principal.organization_id))
            .eq("id", str(supplier_id))
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if not resp.data:
            return None
        performance = await self._performance_by_supplier(principal)
        return self._supplier(resp.data[0], performance.get(str(supplier_id)))

    async def search_catalog(self, principal: ExternalPrincipal, *, query: str | None, limit: int, offset: int) -> list[CatalogItemExternal]:
        client = await get_async_supabase_admin()
        resp = await (
            client.table("supplier_items")
            .select("*,ingredient:canonical_ingredients(canonical_name,category),vendor:vendors(name),prices:supplier_item_prices(price,currency,effective_at)")
            .eq("organization_id", str(principal.organization_id))
            .eq("is_active", True)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        rows = [
            row
            for row in resp.data or []
            if self._supplier_allowed(principal, row.get("vendor_id"))
            and self._property_allowed(principal, row.get("property_id"))
            and self._category_allowed(principal, row)
        ]
        if query:
            needle = query.lower()
            rows = [
                row for row in rows
                if needle in str(row.get("supplier_sku") or "").lower()
                or needle in str(row.get("supplier_name") or "").lower()
                or needle in str((row.get("ingredient") or {}).get("canonical_name") if isinstance(row.get("ingredient"), dict) else "").lower()
            ]
        offers = await self._offers_by_supplier_sku(principal)
        return [self._catalog_item(row, offers.get(str(row.get("supplier_sku")))) for row in rows]

    async def list_offers(self, principal: ExternalPrincipal, *, supplier_id: UUID | None, limit: int, offset: int) -> list[OfferExternal]:
        rows = await self._offer_rows(principal, supplier_id=supplier_id, limit=limit, offset=offset)
        return [self._offer(row) for row in rows]

    async def list_availability(self, principal: ExternalPrincipal, *, supplier_id: UUID | None, limit: int, offset: int) -> list[AvailabilityExternal]:
        rows = await self._offer_rows(principal, supplier_id=supplier_id, limit=limit, offset=offset)
        return [
            AvailabilityExternal(
                offer_id=UUID(str(row["id"])),
                supplier_id=UUID(str(row["vendor_id"])),
                canonical_ingredient_id=UUID(str(row["canonical_ingredient_id"])),
                availability=str(row.get("availability") or "unknown"),
                lead_time_days=int(row.get("lead_time_days") or 0),
                delivery_weekdays=[int(item) for item in row.get("delivery_weekdays") or []],
                order_cutoff=str(row["order_cutoff"]) if row.get("order_cutoff") else None,
                moq=Decimal(str(row.get("moq") or 0)),
                minimum_order_value=Decimal(str(row["minimum_order_value"])) if row.get("minimum_order_value") is not None else None,
            )
            for row in rows
        ]

    async def _offer_rows(self, principal: ExternalPrincipal, *, supplier_id: UUID | None, limit: int, offset: int) -> list[dict[str, Any]]:
        if supplier_id and not self._supplier_allowed(principal, str(supplier_id)):
            return []
        client = await get_async_supabase_admin()
        query = client.table("supplier_item_offers").select("*,ingredient:canonical_ingredients(canonical_name,category)").eq("organization_id", str(principal.organization_id)).order("created_at", desc=True).range(offset, offset + limit - 1)
        if supplier_id:
            query = query.eq("vendor_id", str(supplier_id))
        resp = await query.execute()
        return [
            row
            for row in resp.data or []
            if self._supplier_allowed(principal, row.get("vendor_id"))
            and self._property_allowed(principal, row.get("property_id"))
            and self._category_allowed(principal, row)
        ]

    async def _performance_by_supplier(self, principal: ExternalPrincipal) -> dict[str, dict[str, Any]]:
        client = await get_async_supabase_admin()
        resp = await client.table("supplier_performance_metrics").select("*").eq("organization_id", str(principal.organization_id)).order("created_at", desc=True).limit(500).execute()
        performance: dict[str, dict[str, Any]] = {}
        for row in resp.data or []:
            vendor_id = str(row.get("vendor_id"))
            if vendor_id not in performance and self._supplier_allowed(principal, vendor_id) and self._property_allowed(principal, row.get("property_id")):
                performance[vendor_id] = row
        return performance

    async def _offers_by_supplier_sku(self, principal: ExternalPrincipal) -> dict[str, dict[str, Any]]:
        client = await get_async_supabase_admin()
        resp = await client.table("supplier_item_offers").select("*").eq("organization_id", str(principal.organization_id)).limit(1000).execute()
        offers: dict[str, dict[str, Any]] = {}
        for row in resp.data or []:
            sku = row.get("supplier_sku")
            if sku and self._supplier_allowed(principal, row.get("vendor_id")) and self._property_allowed(principal, row.get("property_id")):
                offers.setdefault(str(sku), row)
        return offers

    def hash_api_key(self, api_key: str) -> str:
        return hashlib.sha256(api_key.encode()).hexdigest()

    def extract_prefix(self, api_key: str) -> str | None:
        parts = api_key.split("_", 2)
        if len(parts) != 3 or parts[0] != "nac" or not parts[1] or not parts[2]:
            return None
        return parts[1]

    def _valid_scopes(self, scopes: list[str]) -> list[str]:
        allowed = set(INITIAL_AGENT_COMMERCE_SCOPES)
        clean = sorted({scope for scope in scopes if scope in allowed})
        if not clean:
            raise ValueError("At least one valid scope is required")
        return clean

    def _supplier_allowed(self, principal: ExternalPrincipal, supplier_id: Any) -> bool:
        if not principal.allowed_supplier_ids:
            return True
        if supplier_id is None:
            return False
        return str(supplier_id) in {str(item) for item in principal.allowed_supplier_ids}

    def _property_allowed(self, principal: ExternalPrincipal, property_id: Any) -> bool:
        if not principal.allowed_property_ids:
            return True
        if property_id is None:
            return False
        return str(property_id) in {str(item) for item in principal.allowed_property_ids}

    def _category_allowed(self, principal: ExternalPrincipal, row: dict[str, Any]) -> bool:
        if not principal.allowed_categories:
            return True
        ingredient = row.get("ingredient") if isinstance(row.get("ingredient"), dict) else {}
        return str(ingredient.get("category") or "") in set(principal.allowed_categories)

    def _service_client(self, row: dict[str, Any]) -> ServiceClientResponse:
        return ServiceClientResponse(
            id=UUID(str(row["id"])),
            name=str(row["name"]),
            description=row.get("description"),
            status=str(row.get("status") or "active"),
            allowed_scopes=[str(item) for item in row.get("allowed_scopes") or []],
            allowed_property_ids=[UUID(str(item)) for item in row.get("allowed_property_ids") or []],
            allowed_supplier_ids=[UUID(str(item)) for item in row.get("allowed_supplier_ids") or []],
            allowed_categories=[str(item) for item in row.get("allowed_categories") or []],
            spend_limit=Decimal(str(row["spend_limit"])) if row.get("spend_limit") is not None else None,
            created_at=row.get("created_at"),
        )

    def _credential(self, row: dict[str, Any]) -> ApiCredentialResponse:
        return ApiCredentialResponse(
            id=UUID(str(row["id"])),
            service_client_id=UUID(str(row["service_client_id"])),
            credential_prefix=str(row["credential_prefix"]),
            name=row.get("name"),
            scopes=[str(item) for item in row.get("scopes") or []],
            expires_at=row.get("expires_at"),
            last_used_at=row.get("last_used_at"),
            revoked_at=row.get("revoked_at"),
            created_at=row.get("created_at"),
        )

    def _supplier(self, row: dict[str, Any], performance: dict[str, Any] | None) -> SupplierExternal:
        return SupplierExternal(
            id=UUID(str(row["id"])),
            name=str(row["name"]),
            contact_email=row.get("contact_email"),
            contact_phone=row.get("contact_phone"),
            address=row.get("address"),
            website=row.get("website"),
            metadata=row.get("metadata") or {},
            performance=performance,
        )

    def _catalog_item(self, row: dict[str, Any], offer: dict[str, Any] | None) -> CatalogItemExternal:
        ingredient = row.get("ingredient") if isinstance(row.get("ingredient"), dict) else {}
        vendor = row.get("vendor") if isinstance(row.get("vendor"), dict) else {}
        prices = row.get("prices") if isinstance(row.get("prices"), list) else []
        price = prices[0] if prices and isinstance(prices[0], dict) else {}
        return CatalogItemExternal(
            supplier_item_id=UUID(str(row["id"])),
            supplier_id=UUID(str(row["vendor_id"])) if row.get("vendor_id") else None,
            supplier_name=str(vendor.get("name") or row.get("supplier_name") or "") or None,
            canonical_ingredient_id=UUID(str(row["canonical_ingredient_id"])),
            canonical_name=ingredient.get("canonical_name"),
            supplier_sku=row.get("supplier_sku"),
            pack_quantity=Decimal(str(row.get("pack_quantity") or 1)),
            base_quantity=Decimal(str(row["base_quantity"])) if row.get("base_quantity") is not None else None,
            latest_price=Decimal(str(price["price"])) if price.get("price") is not None else None,
            currency=price.get("currency"),
            availability=str(offer.get("availability")) if offer else None,
        )

    def _offer(self, row: dict[str, Any]) -> OfferExternal:
        return OfferExternal(
            id=UUID(str(row["id"])),
            supplier_id=UUID(str(row["vendor_id"])),
            canonical_ingredient_id=UUID(str(row["canonical_ingredient_id"])),
            supplier_sku=row.get("supplier_sku"),
            pack_quantity=Decimal(str(row.get("pack_quantity") or 1)),
            normalized_base_quantity=Decimal(str(row.get("normalized_base_quantity") or 1)),
            unit_price=Decimal(str(row.get("unit_price") or 0)),
            contract_price=Decimal(str(row["contract_price"])) if row.get("contract_price") is not None else None,
            currency=str(row.get("currency") or "USD"),
            moq=Decimal(str(row.get("moq") or 0)),
            minimum_order_value=Decimal(str(row["minimum_order_value"])) if row.get("minimum_order_value") is not None else None,
            delivery_fee=Decimal(str(row.get("delivery_fee") or 0)),
            free_delivery_threshold=Decimal(str(row["free_delivery_threshold"])) if row.get("free_delivery_threshold") is not None else None,
            lead_time_days=int(row.get("lead_time_days") or 0),
            order_cutoff=str(row["order_cutoff"]) if row.get("order_cutoff") else None,
            delivery_weekdays=[int(item) for item in row.get("delivery_weekdays") or []],
            availability=str(row.get("availability") or "unknown"),
            valid_from=str(row["valid_from"]) if row.get("valid_from") else None,
            valid_to=str(row["valid_to"]) if row.get("valid_to") else None,
            preferred=bool(row.get("preferred") or False),
            approved=bool(row.get("approved") if row.get("approved") is not None else True),
        )
