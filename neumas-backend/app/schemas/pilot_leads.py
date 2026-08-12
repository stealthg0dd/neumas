from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

PilotLeadStatus = Literal["NEW", "CONTACTED", "QUALIFIED", "PILOT", "CONVERTED", "CLOSED"]


class PilotLeadCreateRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=255)
    contact_name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=64)
    business_type: str = Field(..., min_length=2, max_length=128)
    outlet_count: str = Field(..., min_length=1, max_length=32)
    current_workflow: str = Field(..., min_length=2, max_length=500)
    preferred_start: date | None = None
    source: str = Field(default="pilot_page", max_length=128)
    utm_source: str | None = Field(default=None, max_length=128)
    utm_medium: str | None = Field(default=None, max_length=128)
    utm_campaign: str | None = Field(default=None, max_length=128)
    utm_content: str | None = Field(default=None, max_length=128)
    utm_term: str | None = Field(default=None, max_length=128)


class PilotLeadResponse(BaseModel):
    id: UUID
    company_name: str
    contact_name: str
    email: EmailStr
    phone: str | None = None
    business_type: str
    outlet_count: str
    current_workflow: str
    preferred_start: date | None = None
    source: str
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    utm_content: str | None = None
    utm_term: str | None = None
    status: PilotLeadStatus
    provisioned_org_id: UUID | None = None
    provisioned_property_id: UUID | None = None
    provisioned_user_id: UUID | None = None
    converted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PilotLeadConversionRequest(BaseModel):
    property_name: str | None = Field(default=None, min_length=2, max_length=255)
    org_type: str = Field(default="FNB", max_length=32)
    role: str = Field(default="admin", max_length=32)
    plan: str = Field(default="FNB_GROWTH", max_length=64)


class PilotLeadConversionResponse(BaseModel):
    lead_id: UUID
    status: PilotLeadStatus
    organization_id: UUID
    property_id: UUID
    user_id: UUID
