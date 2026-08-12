from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from app.api.deps import TenantContext
from app.db.repositories.audit_logs import AuditLogsRepository
from app.db.supabase_client import get_async_supabase_admin
from app.schemas.pilot_leads import (
    PilotLeadConversionRequest,
    PilotLeadConversionResponse,
    PilotLeadCreateRequest,
    PilotLeadResponse,
)
from app.services.auth_service import AuthService


class PilotLeadService:
    def __init__(self) -> None:
        self._audit = AuditLogsRepository()
        self._auth_service = AuthService()

    async def submit(self, request: PilotLeadCreateRequest) -> PilotLeadResponse:
        client = await get_async_supabase_admin()
        existing = await (
            client.table("pilot_leads")
            .select("*")
            .ilike("company_name", request.company_name.strip())
            .ilike("email", request.email.lower())
            .limit(1)
            .execute()
        )
        payload = {
            "company_name": request.company_name.strip(),
            "contact_name": request.contact_name.strip(),
            "email": request.email.lower(),
            "phone": (request.phone or "").strip() or None,
            "business_type": request.business_type.strip(),
            "outlet_count": request.outlet_count.strip(),
            "current_workflow": request.current_workflow.strip(),
            "preferred_start": request.preferred_start.isoformat() if request.preferred_start else None,
            "source": request.source.strip() or "pilot_page",
            "utm_source": request.utm_source,
            "utm_medium": request.utm_medium,
            "utm_campaign": request.utm_campaign,
            "utm_content": request.utm_content,
            "utm_term": request.utm_term,
            "status": "NEW",
            "updated_at": datetime.now(UTC).isoformat(),
        }
        if existing.data:
            response = await (
                client.table("pilot_leads")
                .update(payload)
                .eq("id", existing.data[0]["id"])
                .execute()
            )
            row = response.data[0]
        else:
            response = await client.table("pilot_leads").insert(payload).execute()
            row = response.data[0]
        return PilotLeadResponse.model_validate(row)

    async def list(self, tenant: TenantContext) -> list[PilotLeadResponse]:
        client = await get_async_supabase_admin()
        rows = await client.table("pilot_leads").select("*").order("created_at", desc=True).execute()
        return [PilotLeadResponse.model_validate(row) for row in (rows.data or [])]

    async def convert(
        self,
        tenant: TenantContext,
        lead_id: UUID,
        request: PilotLeadConversionRequest,
    ) -> PilotLeadConversionResponse:
        client = await get_async_supabase_admin()
        lead_response = await (
            client.table("pilot_leads")
            .select("*")
            .eq("id", str(lead_id))
            .single()
            .execute()
        )
        lead = lead_response.data or {}
        if not lead:
            raise ValueError("Pilot lead not found")
        if lead.get("status") == "CONVERTED" and lead.get("provisioned_org_id"):
            return PilotLeadConversionResponse(
                lead_id=lead_id,
                status="CONVERTED",
                organization_id=UUID(str(lead["provisioned_org_id"])),
                property_id=UUID(str(lead["provisioned_property_id"])),
                user_id=UUID(str(lead["provisioned_user_id"])),
            )

        provisioned = await self._auth_service.provision_pilot_lead_conversion(
            email=str(lead["email"]),
            org_name=str(lead["company_name"]),
            property_name=request.property_name or f"{lead['company_name']} Primary",
            contact_name=str(lead["contact_name"]),
            org_type=request.org_type,
            role=request.role,
            plan=request.plan,
        )
        now = datetime.now(UTC).isoformat()
        await (
            client.table("pilot_leads")
            .update(
                {
                    "status": "CONVERTED",
                    "provisioned_org_id": str(provisioned["organization_id"]),
                    "provisioned_property_id": str(provisioned["property_id"]),
                    "provisioned_user_id": str(provisioned["user_id"]),
                    "converted_at": now,
                    "updated_at": now,
                }
            )
            .eq("id", str(lead_id))
            .execute()
        )
        await self._audit.log(
            tenant=tenant,
            action="pilot_lead.converted",
            resource_type="pilot_lead",
            resource_id=str(lead_id),
            metadata={
                "organization_id": str(provisioned["organization_id"]),
                "property_id": str(provisioned["property_id"]),
                "user_id": str(provisioned["user_id"]),
            },
        )
        return PilotLeadConversionResponse(
            lead_id=lead_id,
            status="CONVERTED",
            organization_id=provisioned["organization_id"],
            property_id=provisioned["property_id"],
            user_id=provisioned["user_id"],
        )
