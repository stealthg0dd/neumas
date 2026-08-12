"""
Authentication schemas.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class TokenPayload(BaseModel):
    """JWT token payload."""

    sub: str = Field(..., description="Subject (user ID)")
    exp: datetime = Field(..., description="Expiration time")
    iat: datetime | None = Field(None, description="Issued at time")
    aud: str | None = Field(None, description="Audience")
    role: str | None = Field(None, description="User role from Supabase")


class TokenResponse(BaseModel):
    """Token response for authentication."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Token expiry in seconds")
    refresh_token: str | None = None


class LoginRequest(BaseModel):
    """Login request body."""

    email: EmailStr
    password: str = Field(..., min_length=8)


class RefreshTokenRequest(BaseModel):
    """Refresh token request body."""

    refresh_token: str


class UserInfo(BaseModel):
    """Current user info from auth."""

    id: UUID
    auth_id: UUID
    email: EmailStr
    full_name: str | None = None
    role: str
    organization_id: UUID
    permissions: dict[str, bool] = Field(default_factory=dict)
    is_active: bool = True


class CurrentUserContext(BaseModel):
    """
    Full context for the current authenticated user.
    Used by dependency injection.
    """

    user: UserInfo
    organization_id: UUID
    property_id: UUID | None = None
    permissions: list[str] = Field(default_factory=list)

    @property
    def is_admin(self) -> bool:
        return self.user.role == "admin"

    @property
    def is_manager(self) -> bool:
        return self.user.role in ("admin", "manager")


class PasswordChangeRequest(BaseModel):
    """Password change request."""

    current_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8)


class PasswordResetRequest(BaseModel):
    """Password reset request."""

    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation."""

    token: str
    new_password: str = Field(..., min_length=8)


class SignupRequest(BaseModel):
    """User signup request (for new organizations)."""

    email: EmailStr
    password: str = Field(..., min_length=8)
    org_name: str = Field(..., min_length=2, max_length=255, description="Organization name")
    property_name: str = Field(..., min_length=2, max_length=255, description="Property name")
    org_type: str | None = Field(None, max_length=64, description="Organization type")
    property_address: str | None = Field(None, max_length=500, description="First property address")
    role: str = Field(default="admin", description="Role (admin for creators)")


class SignupResponse(BaseModel):
    """Signup response with JWT and profile."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None
    profile: "ProfileResponse"


class ProfileResponse(BaseModel):
    """User profile info."""

    user_id: UUID
    email: EmailStr
    full_name: str | None = None
    org_id: UUID
    org_name: str
    property_id: UUID
    property_name: str
    role: str
    org_type: str | None = None
    workspace_experience: str = "NEEDS_PERSONA"
    is_invited_user: bool = False


class DigestPreferencesResponse(BaseModel):
    """User digest email preferences."""

    email_digest_enabled: bool = True
    timezone: str = "UTC"
    property_timezone: str = "UTC"
    safety_buffer_days: int = 3
    preferred_currency: str = "USD"


class DigestPreferencesUpdate(BaseModel):
    """Partial update for digest preferences."""

    email_digest_enabled: bool | None = None
    timezone: str | None = None
    safety_buffer_days: int | None = Field(default=None, ge=0, le=60)
    preferred_currency: str | None = Field(default=None, min_length=3, max_length=3)


class LoginResponse(BaseModel):
    """Login response with JWT and profile."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None
    profile: ProfileResponse


class GoogleCompleteRequest(BaseModel):
    """Complete profile for a Google OAuth user.

    org_name and property_name are optional so that the first probe call from
    /auth/callback (empty body) passes Pydantic validation.  The route handler
    raises HTTP 422 explicitly when they are absent and the user is new.
    """

    org_name: str | None = Field(None, min_length=2, max_length=255, description="Organization name")
    property_name: str | None = Field(None, min_length=2, max_length=255, description="Property name")
    org_type: str | None = Field(None, max_length=64, description="Workspace persona")
    property_type: str | None = Field(None, max_length=64, description="First property type")
    role: str = Field(default="admin", description="Role for the new account owner")


OnboardingStatus = Literal["NOT_STARTED", "IN_PROGRESS", "ACTIVATED", "SKIPPED"]

BusinessType = Literal[
    "Restaurant",
    "Cafe / Bakery",
    "Cloud Kitchen",
    "Catering",
    "Hotel / Hospitality",
    "Food Manufacture",
    "Bar / Pub",
    "Other",
]


class OnboardingOutletInput(BaseModel):
    onboarding_key: str | None = Field(default=None, max_length=128)
    name: str = Field(..., min_length=2, max_length=255)
    property_type: str = Field(..., min_length=2, max_length=64)
    address: str | None = Field(default=None, max_length=500)
    is_primary: bool = False


class OnboardingOutletResponse(BaseModel):
    property_id: UUID
    onboarding_key: str | None = None
    name: str
    property_type: str | None = None
    address: str | None = None
    is_primary: bool = False
    onboarding_order: int | None = None


class ActivationMilestonesResponse(BaseModel):
    business_setup_completed: bool = False
    first_property_created: bool = False
    first_document_uploaded: bool = False
    first_document_approved: bool = False
    first_ledger_post: bool = False
    first_forecast_generated: bool = False
    first_reorder_reviewed: bool = False


class ActivationChecklistStep(BaseModel):
    id: str
    label: str
    description: str | None = None
    href: str | None = None
    completed: bool = False


class HouseholdOnboardingProfile(BaseModel):
    household_name: str | None = None
    household_size: int | None = None
    shopping_frequency: str | None = None
    favorite_stores: list[str] = Field(default_factory=list)
    waste_reduction_goal: str | None = None
    monthly_grocery_budget: float | None = None
    dietary_preferences: list[str] = Field(default_factory=list)


class OnboardingStateResponse(BaseModel):
    """Canonical onboarding state for the current organization/workspace."""

    organization_id: UUID
    property_id: UUID | None = None
    org_type: str | None = None
    business_type: BusinessType | str | None = None
    workspace_experience: str = "NEEDS_PERSONA"
    is_invited_user: bool = False
    has_properties: bool = False
    target_outlet_count: int | None = None
    household_profile: HouseholdOnboardingProfile = Field(
        default_factory=HouseholdOnboardingProfile
    )
    outlets: list[OnboardingOutletResponse] = Field(default_factory=list)
    activation_milestones: ActivationMilestonesResponse = Field(
        default_factory=ActivationMilestonesResponse
    )
    activation_checklist: list[ActivationChecklistStep] = Field(default_factory=list)
    dashboard_unlocked: bool = False
    property_type: str | None = None
    address: str | None = None
    onboarding_status: OnboardingStatus
    onboarding_started_at: datetime | None = None
    onboarding_completed_at: datetime | None = None
    onboarding_version: int = 1
    onboarding_source: str | None = None
    country: str | None = None
    currency: str | None = None
    has_scans: bool = False
    has_inventory_activity: bool = False
    is_complete: bool = False
    requires_onboarding: bool = True


class OnboardingStateUpdate(BaseModel):
    """Partial update for canonical onboarding state."""

    onboarding_status: OnboardingStatus | None = None
    onboarding_source: str | None = Field(default=None, max_length=128)
    org_type: str | None = Field(default=None, max_length=64)
    business_type: BusinessType | str | None = Field(default=None, max_length=64)
    org_name: str | None = Field(default=None, min_length=2, max_length=255)
    country: str | None = Field(default=None, max_length=64)
    currency: str | None = Field(default=None, max_length=16)
    outlet_count: int | None = Field(default=None, ge=1, le=500)
    household_size: int | None = Field(default=None, ge=1, le=50)
    shopping_frequency: str | None = Field(default=None, max_length=64)
    favorite_stores: list[str] = Field(default_factory=list, max_length=10)
    waste_reduction_goal: str | None = Field(default=None, max_length=255)
    monthly_grocery_budget: float | None = Field(default=None, ge=0)
    dietary_preferences: list[str] = Field(default_factory=list, max_length=12)
    data_start_choice: str | None = Field(default=None, max_length=64)
    idempotency_key: str | None = Field(default=None, max_length=128)
    outlets: list[OnboardingOutletInput] = Field(default_factory=list)
    property_name: str | None = Field(default=None, min_length=2, max_length=255)
    property_type: str | None = Field(default=None, max_length=64)
    address: str | None = Field(default=None, max_length=500)


class InviteUserRequest(BaseModel):
    """Invite user to organization."""

    email: EmailStr
    role: str = Field(default="member")
    full_name: str | None = None


class AcceptInviteRequest(BaseModel):
    """Accept organization invite."""

    token: str
    password: str = Field(..., min_length=8)
    full_name: str | None = None
