"""
Authentication service for user authentication and authorization.
"""

import re
import secrets
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from postgrest.exceptions import APIError as PostgRESTAPIError

from app.core.config import settings
from app.core.logging import get_logger
from app.core.security import (
    TokenValidationError,
    decode_token,
)
from app.db.supabase_client import get_async_supabase_admin, get_auth_client
from app.schemas.auth import (
    ActivationChecklistStep,
    ActivationMilestonesResponse,
    CurrentUserContext,
    HouseholdOnboardingProfile,
    LoginResponse,
    OnboardingOutletInput,
    OnboardingOutletResponse,
    OnboardingStateResponse,
    OnboardingStateUpdate,
    ProfileResponse,
    SignupRequest,
    SignupResponse,
    TokenResponse,
    UserInfo,
)
from supabase import create_async_client

logger = get_logger(__name__)

_FNB_BUSINESS_TYPES: set[str] = {
    "Restaurant",
    "Cafe / Bakery",
    "Cloud Kitchen",
    "Catering",
    "Hotel / Hospitality",
    "Food Manufacture",
    "Bar / Pub",
    "Other",
}


def _utcnow() -> str:
    return datetime.now(UTC).isoformat()


def generate_slug(name: str) -> str:
    """
    Generate a URL-safe slug from a name.

    Converts to lowercase, replaces spaces/special chars with hyphens,
    and appends a random suffix for uniqueness.

    Example: 'Test Lab' -> 'test-lab-a1b2'
    """
    # Convert to lowercase and replace spaces with hyphens
    slug = name.lower().strip()
    # Replace any non-alphanumeric characters (except hyphens) with hyphens
    slug = re.sub(r'[^a-z0-9-]', '-', slug)
    # Collapse multiple hyphens
    slug = re.sub(r'-+', '-', slug)
    # Strip leading/trailing hyphens
    slug = slug.strip('-')
    # Append random suffix for uniqueness (4 hex chars)
    suffix = secrets.token_hex(2)
    return f"{slug}-{suffix}"


def _handle_pgrst_error(err: Exception, context: str = "") -> None:
    """
    Inspect a PostgREST APIError and emit an actionable operator log when a
    schema-cache miss (PGRST204) is detected.

    If PGRST204 is found the caller should still re-raise the original error
    after calling this function.
    """
    code = getattr(err, "code", None)
    # postgrest-py attaches the JSON body as .json() on some versions;
    # fall back to string-scanning the message as a safety net.
    if code is None:
        code = "PGRST204" if "PGRST204" in str(err) else None

    if code == "PGRST204":
        logger.error(
            "PostgREST schema cache miss (PGRST204) -- column or relation not found. "
            "ACTION REQUIRED: open the Supabase SQL Editor and run: "
            "NOTIFY pgrst, 'reload schema';",
            context=context,
            error=str(err),
        )


def _extract_org_id(user_row: dict[str, Any]) -> UUID:
    """Support both legacy `org_id` and canonical `organization_id` columns."""
    raw_org_id = user_row.get("organization_id") or user_row.get("org_id")
    if not raw_org_id:
        raise ValueError("User row missing organization identifier")
    return UUID(str(raw_org_id))


def _build_user_insert_payload_variants(
    *,
    auth_id: str,
    email: str,
    org_id: UUID,
    property_id: UUID,
    role: str,
) -> list[dict[str, Any]]:
    base_payload = {
        "auth_id": auth_id,
        "email": email.lower(),
        "default_property_id": str(property_id),
        "role": role,
        "is_active": True,
    }
    org_id_str = str(org_id)
    return [
        {**base_payload, "organization_id": org_id_str},
        {**base_payload, "organization_id": org_id_str, "org_id": org_id_str},
        {**base_payload, "org_id": org_id_str},
    ]


def _normalize_org_type(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None

    normalized = raw.upper().replace("-", "_").replace(" ", "_")
    legacy_fnb_values = {
        "RESTAURANT",
        "HOTEL",
        "CAFE",
        "CAFÉ",
        "BAR",
        "CATERING",
        "OTHER",
        "FNB_BUSINESS",
        "FOOD_AND_BEVERAGE",
    }
    if normalized in legacy_fnb_values:
        return "FNB"
    if normalized == "HOME":
        return "HOUSEHOLD"
    if normalized in {"FNB", "HOUSEHOLD", "RETAIL_BUSINESS"}:
        return normalized
    return raw


def _is_invited_user(role: str) -> bool:
    return role != "admin"


def _normalize_business_type(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None

    aliases = {
        "Cafe / Bakery": {"Café / Bakery", "Cafe / Bakery"},
        "Cloud Kitchen": {"Cloud Kitchen"},
        "Food Manufacture": {"Food Manufacture", "Food Manufacturing"},
        "Hotel / Hospitality": {"Hotel / Hospitality", "Hotel", "Hospitality"},
        "Bar / Pub": {"Bar / Pub", "Bar", "Pub"},
    }
    for canonical, options in aliases.items():
        if raw in options:
            return canonical
    if raw in _FNB_BUSINESS_TYPES:
        return raw
    return raw


def _property_type_slug(value: str | None) -> str:
    raw = (value or "").strip().lower()
    mapping = {
        "restaurant": "restaurant",
        "cafe / bakery": "cafe",
        "café / bakery": "cafe",
        "cloud kitchen": "cloud_kitchen",
        "catering": "catering",
        "hotel / hospitality": "hotel",
        "food manufacture": "manufacture",
        "bar / pub": "bar",
        "other": "other",
        "household": "household",
    }
    return mapping.get(raw, re.sub(r"[^a-z0-9]+", "_", raw).strip("_") or "other")


_PROPERTY_SCHEMA_COMPAT_FIELDS = {
    "property_type",
    "onboarding_order",
    "is_primary",
    "onboarding_key",
}


def _is_property_schema_compat_error(err: Exception) -> bool:
    message = str(err).lower()
    if "properties" not in message:
        return False
    return any(field in message for field in _PROPERTY_SCHEMA_COMPAT_FIELDS)


def _legacy_property_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.items()
        if key not in _PROPERTY_SCHEMA_COMPAT_FIELDS
    }


def _resolve_workspace_experience(
    *,
    org_type: str | None,
    role: str,
    has_properties: bool,
    has_scans: bool,
    has_inventory_activity: bool,
    onboarding_source: str | None = None,
) -> str:
    normalized_org_type = _normalize_org_type(org_type)
    if normalized_org_type == "FNB":
        return "INVITED" if _is_invited_user(role) else "FNB"
    if normalized_org_type == "HOUSEHOLD":
        return "INVITED" if _is_invited_user(role) else "HOUSEHOLD"
    if has_scans or has_inventory_activity or (has_properties and not onboarding_source):
        # Compatibility path only: preserve routing for legacy workspaces
        # without mutating org_type in-place.
        return "LEGACY_FNB"
    return "NEEDS_PERSONA"


class AuthService:
    """Service for authentication and authorization."""

    @staticmethod
    def normalize_org_type(value: str | None) -> str | None:
        return _normalize_org_type(value)

    @staticmethod
    def normalize_business_type(value: str | None) -> str | None:
        return _normalize_business_type(value)

    @staticmethod
    def _coerce_settings(settings_value: Any) -> dict[str, Any]:
        return settings_value if isinstance(settings_value, dict) else {}

    @staticmethod
    def _coerce_activation_milestones(value: Any) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        return {
            str(key): str(ts)
            for key, ts in value.items()
            if isinstance(key, str) and isinstance(ts, str) and ts.strip()
        }

    async def _update_organization_settings(
        self,
        organization_id: UUID,
        mutate: Callable[[dict[str, Any]], dict[str, Any]],
    ) -> dict[str, Any]:
        admin_client = await get_async_supabase_admin()
        org_response = await (
            admin_client.table("organizations")
            .select("settings")
            .eq("id", str(organization_id))
            .single()
            .execute()
        )
        current_settings = self._coerce_settings((org_response.data or {}).get("settings"))
        next_settings = mutate({**current_settings})
        await (
            admin_client.table("organizations")
            .update({"settings": next_settings})
            .eq("id", str(organization_id))
            .execute()
        )
        return next_settings

    async def _list_properties_for_org(self, organization_id: UUID) -> list[dict[str, Any]]:
        admin_client = await get_async_supabase_admin()
        try:
            response = await (
                admin_client.table("properties")
                .select("*")
                .eq("organization_id", str(organization_id))
                .eq("is_active", True)
                .order("onboarding_order", desc=False)
                .order("created_at", desc=False)
                .execute()
            )
        except Exception as exc:
            if not _is_property_schema_compat_error(exc):
                raise
            logger.warning(
                "Falling back to legacy property listing for onboarding compatibility",
                organization_id=str(organization_id),
                error=str(exc),
            )
            response = await (
                admin_client.table("properties")
                .select("*")
                .eq("organization_id", str(organization_id))
                .eq("is_active", True)
                .order("created_at", desc=False)
                .execute()
            )
        return response.data or []

    async def _update_property_row(
        self,
        organization_id: UUID,
        property_id: str,
        payload: dict[str, Any],
    ) -> None:
        admin_client = await get_async_supabase_admin()
        try:
            await (
                admin_client.table("properties")
                .update(payload)
                .eq("id", property_id)
                .eq("organization_id", str(organization_id))
                .execute()
            )
        except Exception as exc:
            if not _is_property_schema_compat_error(exc):
                raise
            logger.warning(
                "Retrying property update without onboarding compatibility fields",
                organization_id=str(organization_id),
                property_id=property_id,
                error=str(exc),
            )
            await (
                admin_client.table("properties")
                .update(_legacy_property_payload(payload))
                .eq("id", property_id)
                .eq("organization_id", str(organization_id))
                .execute()
            )

    async def _insert_property_row(
        self,
        organization_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        admin_client = await get_async_supabase_admin()
        insert_payload = {
            "organization_id": str(organization_id),
            **payload,
        }
        try:
            response = await admin_client.table("properties").insert(insert_payload).execute()
        except Exception as exc:
            if not _is_property_schema_compat_error(exc):
                raise
            logger.warning(
                "Retrying property insert without onboarding compatibility fields",
                organization_id=str(organization_id),
                error=str(exc),
            )
            response = await (
                admin_client.table("properties")
                .insert({
                    "organization_id": str(organization_id),
                    **_legacy_property_payload(payload),
                })
                .execute()
            )
        return response.data[0] if response.data else None

    async def _get_org_activity_counts(self, organization_id: UUID) -> dict[str, int]:
        admin_client = await get_async_supabase_admin()

        async def _count(table: str, *, eq: dict[str, Any] | None = None) -> int:
            query = admin_client.table(table).select("id", count="exact").limit(1)
            for key, value in (eq or {}).items():
                query = query.eq(key, value)
            response = await query.execute()
            return int(getattr(response, "count", 0) or 0)

        return {
            "properties": await _count("properties", eq={"organization_id": str(organization_id), "is_active": True}),
            "scans": await _count("scans", eq={"organization_id": str(organization_id)}),
            "documents_approved": await _count(
                "documents",
                eq={"organization_id": str(organization_id), "status": "approved"},
            ),
            "documents_review_pending": await _count(
                "documents",
                eq={"organization_id": str(organization_id), "review_needed": True},
            ),
            "ledger_posts": await _count(
                "inventory_movements",
                eq={"organization_id": str(organization_id)},
            ),
            "forecasts": await _count(
                "predictions",
                eq={"organization_id": str(organization_id)},
            ),
            "reorders_reviewed": await _count(
                "shopping_lists",
                eq={"organization_id": str(organization_id), "status": "approved"},
            ),
            "vendors": await _count("vendors", eq={"organization_id": str(organization_id)}),
        }

    def _resolve_activation_milestones(
        self,
        *,
        org: dict[str, Any],
        settings: dict[str, Any],
        counts: dict[str, int],
    ) -> tuple[ActivationMilestonesResponse, dict[str, str]]:
        persisted = self._coerce_activation_milestones(org.get("activation_milestones"))
        now = _utcnow()

        def _mark(key: str, condition: bool) -> None:
            if condition and key not in persisted:
                persisted[key] = now

        normalized_org_type = _normalize_org_type(org.get("org_type"))
        if normalized_org_type == "HOUSEHOLD":
            business_setup_completed = bool(
                (org.get("name") or "").strip()
                and (org.get("country") or "").strip()
                and (org.get("currency") or "").strip()
                and int((settings.get("household_size") or 0) or 0) > 0
            )
        else:
            business_setup_completed = bool(
                (org.get("name") or "").strip()
                and normalized_org_type == "FNB"
                and _normalize_business_type(org.get("business_type"))
                and (org.get("country") or "").strip()
                and (org.get("currency") or "").strip()
                and int((settings.get("target_outlet_count") or 0) or 0) > 0
            )
        _mark("business_setup_completed", business_setup_completed)
        _mark("first_property_created", counts["properties"] > 0)
        _mark("first_document_uploaded", counts["scans"] > 0)
        _mark("first_document_approved", counts["documents_approved"] > 0)
        _mark("first_ledger_post", counts["ledger_posts"] > 0)
        _mark("first_forecast_generated", counts["forecasts"] > 0)
        _mark("first_reorder_reviewed", counts["reorders_reviewed"] > 0)

        return (
            ActivationMilestonesResponse(
                business_setup_completed="business_setup_completed" in persisted,
                first_property_created="first_property_created" in persisted,
                first_document_uploaded="first_document_uploaded" in persisted,
                first_document_approved="first_document_approved" in persisted,
                first_ledger_post="first_ledger_post" in persisted,
                first_forecast_generated="first_forecast_generated" in persisted,
                first_reorder_reviewed="first_reorder_reviewed" in persisted,
            ),
            persisted,
        )

    def _build_activation_checklist(
        self,
        milestones: ActivationMilestonesResponse,
        *,
        vendor_count: int,
        documents_review_pending: int = 0,
        org_type: str | None = None,
    ) -> list[ActivationChecklistStep]:
        review_complete = milestones.first_document_approved or (
            milestones.first_document_uploaded and milestones.first_ledger_post and documents_review_pending == 0
        )
        if _normalize_org_type(org_type) == "HOUSEHOLD":
            return [
                ActivationChecklistStep(
                    id="scan_first_receipt",
                    label="Scan first grocery receipt",
                    description="Use the existing receipt pipeline to seed pantry state.",
                    href="/dashboard/scans/new",
                    completed=milestones.first_document_uploaded,
                ),
                ActivationChecklistStep(
                    id="review_detected_items",
                    label="Review detected items",
                    description="Approve the first receipt so pantry items post to the ledger.",
                    href="/dashboard/documents",
                    completed=review_complete,
                ),
                ActivationChecklistStep(
                    id="check_running_low",
                    label="Check running low items",
                    description="See what needs topping up before the next shop.",
                    href="/dashboard/shopping",
                    completed=milestones.first_reorder_reviewed,
                ),
                ActivationChecklistStep(
                    id="review_use_soon",
                    label="Review use soon items",
                    description="Use alerts and expiry risk to reduce waste.",
                    href="/dashboard/alerts",
                    completed=milestones.first_document_approved,
                ),
                ActivationChecklistStep(
                    id="review_spending",
                    label="Review spending snapshot",
                    description="Track grocery spend once receipts establish a baseline.",
                    href="/dashboard/analytics",
                    completed=milestones.first_document_uploaded,
                ),
            ]
        return [
            ActivationChecklistStep(
                id="upload_first_invoice",
                label="Upload first invoice",
                description="Use the existing document pipeline to seed live inventory.",
                href="/dashboard/scans/new",
                completed=milestones.first_document_uploaded,
            ),
            ActivationChecklistStep(
                id="review_extracted_items",
                label="Review extracted items",
                description="Approve your first document so inventory posts to the ledger.",
                href="/dashboard/documents",
                completed=review_complete,
            ),
            ActivationChecklistStep(
                id="run_first_forecast",
                label="Run first forecast",
                description="Generate the first depletion forecast from your current evidence.",
                href="/dashboard/predictions",
                completed=milestones.first_forecast_generated,
            ),
            ActivationChecklistStep(
                id="review_first_reorder",
                label="Review first reorder",
                description="Approve a reorder plan once forecast risk appears.",
                href="/dashboard/shopping",
                completed=milestones.first_reorder_reviewed,
            ),
            ActivationChecklistStep(
                id="add_supplier",
                label="Add supplier",
                description="Suppliers improve downstream reorder exports and vendor grouping.",
                href="/dashboard/vendors",
                completed=vendor_count > 0,
            ),
            ActivationChecklistStep(
                id="invite_teammate",
                label="Invite teammate",
                description="Bring another operator into the workspace once the first flow is live.",
                href="/dashboard/admin",
                completed=False,
            ),
        ]

    @staticmethod
    def _build_household_profile(settings: dict[str, Any], org_name: str | None) -> HouseholdOnboardingProfile:
        favorite_stores = settings.get("favorite_stores")
        dietary_preferences = settings.get("dietary_preferences")
        return HouseholdOnboardingProfile(
            household_name=(org_name or "").strip() or None,
            household_size=int((settings.get("household_size") or 0) or 0) or None,
            shopping_frequency=(settings.get("shopping_frequency") or None),
            favorite_stores=[
                str(store).strip()
                for store in (favorite_stores if isinstance(favorite_stores, list) else [])
                if str(store).strip()
            ],
            waste_reduction_goal=(settings.get("waste_reduction_goal") or None),
            monthly_grocery_budget=(
                float(settings["monthly_grocery_budget"])
                if settings.get("monthly_grocery_budget") not in (None, "")
                else None
            ),
            dietary_preferences=[
                str(pref).strip()
                for pref in (dietary_preferences if isinstance(dietary_preferences, list) else [])
                if str(pref).strip()
            ],
        )

    async def validate_token(self, token: str) -> dict[str, Any]:
        """
        Validate JWT token and return payload.

        Args:
            token: JWT access token

        Returns:
            Token payload

        Raises:
            TokenValidationError: If token is invalid
        """
        # First try local JWT validation
        try:
            payload = decode_token(token)
            return payload
        except TokenValidationError:
            # Fall back to Supabase auth verification
            auth_client = await get_auth_client()
            user_data = await auth_client.get_user(token)
            if not user_data:
                raise TokenValidationError("Token validation failed")
            return {"sub": user_data["id"], **user_data}

    async def get_user_from_token(self, token: str) -> UserInfo:
        """
        Get user info from JWT token.

        Args:
            token: JWT access token

        Returns:
            UserInfo with user details

        Raises:
            TokenValidationError: If token invalid or user not found
        """
        # Extract auth_id from token
        payload = await self.validate_token(token)
        auth_id_str = payload.get("sub")
        if not auth_id_str:
            raise TokenValidationError("Token missing subject claim")

        auth_id = UUID(auth_id_str)

        # Get user from database (direct admin query, no TenantContext needed)
        admin_client = await get_async_supabase_admin()
        user_response = await (
            admin_client.table("users")
            .select("*")
            .eq("auth_id", str(auth_id))
            .single()
            .execute()
        )

        user = user_response.data
        if not user:
            logger.warning("User not found for auth_id", auth_id=str(auth_id))
            raise TokenValidationError("User not found")

        if not user.get("is_active"):
            raise TokenValidationError("User is deactivated")

        organization_id = _extract_org_id(user)

        return UserInfo(
            id=UUID(user["id"]),
            auth_id=auth_id,
            email=user["email"],
            full_name=user.get("full_name"),
            role=user["role"],
            organization_id=organization_id,
            permissions=user.get("permissions", {}) or {},
            is_active=user["is_active"],
        )

    async def get_current_user_context(
        self,
        token: str,
        property_id: UUID | None = None,
    ) -> CurrentUserContext:
        """
        Get full user context for request.

        Args:
            token: JWT access token
            property_id: Optional property ID from request

        Returns:
            CurrentUserContext with user, org, and property
        """
        user = await self.get_user_from_token(token)

        # Build permissions list
        permissions = []
        if user.role == "admin":
            permissions = ["*"]  # Admin has all permissions
        else:
            permissions = [k for k, v in user.permissions.items() if v]

        return CurrentUserContext(
            user=user,
            organization_id=user.organization_id,
            property_id=property_id,
            permissions=permissions,
        )

    async def verify_organization_access(
        self,
        user: UserInfo,
        org_id: UUID,
    ) -> bool:
        """
        Verify user has access to an organization.

        Args:
            user: Current user
            org_id: Organization ID to check

        Returns:
            True if user has access
        """
        # Users can only access their own organization
        # unless they're a system admin (future feature)
        return user.organization_id == org_id

    async def verify_property_access(
        self,
        user: UserInfo,
        property_id: UUID,
    ) -> bool:
        """
        Verify user has access to a property.

        Args:
            user: Current user
            property_id: Property ID to check

        Returns:
            True if user has access
        """
        # Direct admin query to check property belongs to user's org
        admin_client = await get_async_supabase_admin()
        response = await (
            admin_client.table("properties")
            .select("id")
            .eq("id", str(property_id))
            .eq("organization_id", str(user.organization_id))
            .eq("is_active", True)
            .execute()
        )
        return len(response.data) > 0

    async def check_permission(
        self,
        user: UserInfo,
        permission: str,
    ) -> bool:
        """
        Check if user has a specific permission.

        Args:
            user: Current user
            permission: Permission to check

        Returns:
            True if user has permission
        """
        # Admin role has all permissions
        if user.role == "admin":
            return True

        # Manager role has most permissions
        if user.role == "manager":
            manager_permissions = [
                "inventory:read",
                "inventory:write",
                "scans:read",
                "scans:write",
                "predictions:read",
                "shopping:read",
                "shopping:write",
                "users:read",
            ]
            if permission in manager_permissions:
                return True

        # Check explicit permissions
        return user.permissions.get(permission, False)

    async def signup(self, request: SignupRequest) -> SignupResponse:
        """
        Register new user with org and property creation.

        Flow:
        1. Create user in Supabase Auth
        2. Generate unique organization slug
        3. Create organization record
        4. Create property record
        5. Create user record linking everything

        Args:
            request: Signup request with email, password, org_name, property_name, role

        Returns:
            SignupResponse with access_token and profile

        Raises:
            Exception: If signup fails at any step
        """
        # -- Isolated Auth Client Pattern -------------------------------------
        # The _async_admin_client is a singleton initialised once at startup
        # with the service_role key.  Calling sign_in_with_password() on it
        # attaches a user-scoped JWT to the client's internal session, which
        # then gets used for every subsequent .table() call -- bypassing the
        # service-role bypass and triggering recursive RLS policies.
        #
        # Rule: only the singleton admin_client (service_role) touches the DB.
        #       A transient sign_in_client (also service_role key, freshly
        #       constructed and immediately discarded) is used solely to obtain
        #       the session tokens.  It is never reused.
        # ---------------------------------------------------------------------
        admin_client = await get_async_supabase_admin()
        normalized_org_type = _normalize_org_type(request.org_type)
        auth_id: UUID | None = None  # tracked for rollback

        try:
            # -- Step 1: Create Auth user --------------------------------------
            # admin.create_user + email_confirm:True bypasses SMTP rate limits
            # and immediately activates the account -- no verification email sent.
            logger.info("Step 1: Creating auth user", email=request.email)
            auth_user_response = await admin_client.auth.admin.create_user({
                "email": request.email,
                "password": request.password,
                "email_confirm": True,
            })
            if not auth_user_response.user:
                raise ValueError("Failed to create auth user -- no user returned")

            auth_id = auth_user_response.user.id
            logger.info("Auth user created", auth_id=str(auth_id), email=request.email)

            # -- Step 2: Obtain session via transient client -------------------
            # Create a throw-away AsyncClient with the service_role key.
            # sign_in_with_password mutates the client's internal session, so
            # we MUST NOT reuse it for any table() operations afterwards.
            sign_in_client = await create_async_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_ROLE_KEY,
            )
            login_response = await sign_in_client.auth.sign_in_with_password({
                "email": request.email,
                "password": request.password,
            })
            # sign_in_client is intentionally not stored -- it is discarded here.
            del sign_in_client

            session = login_response.session
            access_token: str = session.access_token if session else ""
            expires_in: int = session.expires_in if session else 3600
            refresh_token: str | None = session.refresh_token if session else None
            logger.info("Session obtained", has_token=bool(access_token))

            # -- Step 3: Generate unique org slug -----------------------------
            org_slug = generate_slug(request.org_name)
            logger.info("Generated slug", slug=org_slug, org_name=request.org_name)

            # -- Step 4: Insert organization (service_role, bypasses RLS) -----
            logger.info("Step 4: Creating organization", name=request.org_name, slug=org_slug)
            try:
                org_response = await admin_client.table("organizations").insert({
                    "name": request.org_name,
                    "slug": org_slug,
                    "org_type": normalized_org_type,
                    "onboarding_status": "IN_PROGRESS",
                    "onboarding_started_at": _utcnow(),
                    "onboarding_version": 1,
                    "onboarding_source": "signup",
                }).execute()
            except PostgRESTAPIError as exc:
                _handle_pgrst_error(exc, context="organizations.insert")
                raise

            if not org_response.data:
                raise ValueError(f"Failed to create organization: {org_response}")

            org_id = UUID(org_response.data[0]["id"])
            logger.info("Organization created", org_id=str(org_id), slug=org_slug)

            # -- Step 5: Insert property (service_role, bypasses RLS) ---------
            logger.info("Step 5: Creating property", name=request.property_name, org_id=str(org_id))
            try:
                prop_response = await admin_client.table("properties").insert({
                    "organization_id": str(org_id),
                    "name": request.property_name,
                    "type": "hotel",
                    "property_type": normalized_org_type,
                    "address": request.property_address,
                    "onboarding_order": 1,
                    "is_primary": True,
                }).execute()
            except PostgRESTAPIError as exc:
                _handle_pgrst_error(exc, context="properties.insert")
                raise

            if not prop_response.data:
                raise ValueError(f"Failed to create property: {prop_response}")

            property_id = UUID(prop_response.data[0]["id"])
            logger.info("Property created", property_id=str(property_id))

            # -- Step 6: Insert user record (service_role, bypasses RLS) ------
            # auth_id links this profile to the Supabase Auth identity.
            # org_id links to the organisation created above.
            logger.info("Step 6: Creating user record", auth_id=str(auth_id), org_id=str(org_id))
            try:
                insert_errors: list[str] = []
                user_response = None
                for payload in _build_user_insert_payload_variants(
                    auth_id=str(auth_id),
                    email=request.email,
                    org_id=org_id,
                    property_id=property_id,
                    role=request.role,
                ):
                    try:
                        user_response = await admin_client.table("users").insert(payload).execute()
                        if user_response.data:
                            break
                    except Exception as exc:
                        insert_errors.append(str(exc))
                        continue
            except PostgRESTAPIError as exc:
                _handle_pgrst_error(exc, context="users.insert")
                raise

            if not user_response or not user_response.data:
                raise ValueError(
                    "Failed to create user record: "
                    + (" | ".join(insert_errors) if insert_errors else "unknown error")
                )

            user_id = UUID(user_response.data[0]["id"])
            logger.info("User record created", user_id=str(user_id), email=request.email)

        except Exception:
            # -- Rollback: remove the Supabase Auth user if it was created -----
            # This keeps auth state consistent with the DB on partial failures.
            if auth_id is not None:
                try:
                    await admin_client.auth.admin.delete_user(str(auth_id))
                    logger.warning(
                        "Signup rolled back -- auth user deleted",
                        auth_id=str(auth_id),
                        email=request.email,
                    )
                except Exception as rollback_err:
                    logger.error(
                        "Rollback failed -- auth user may be orphaned",
                        auth_id=str(auth_id),
                        rollback_error=str(rollback_err),
                    )
            raise

        # -- Build and return response -----------------------------------------
        profile = ProfileResponse(
            user_id=user_id,
            email=request.email,
            org_id=org_id,
            org_name=request.org_name,
            property_id=property_id,
            property_name=request.property_name,
            role=request.role,
            org_type=normalized_org_type,
            workspace_experience=(
                "INVITED" if _is_invited_user(request.role) and normalized_org_type else
                normalized_org_type if normalized_org_type in {"FNB", "HOUSEHOLD"} else
                "NEEDS_PERSONA"
            ),
            is_invited_user=_is_invited_user(request.role),
        )

        logger.info("Signup completed successfully", user_id=str(user_id), org_id=str(org_id))

        # Explicitly map all three session fields so the frontend always
        # receives a fully-populated token response.
        return SignupResponse(
            access_token=access_token,
            expires_in=expires_in,
            refresh_token=refresh_token,
            profile=profile,
        )

    async def login(self, email: str, password: str) -> LoginResponse:
        """
        Authenticate user via Supabase Auth.

        Args:
            email: User email
            password: User password

        Returns:
            LoginResponse with JWT and profile

        Raises:
            TokenValidationError: If authentication fails
        """
        admin_client = await get_async_supabase_admin()

        # Authenticate with a fresh isolated client to avoid contaminating the
        # singleton admin client's session (sign_in mutates internal JWT state).
        sign_in_client = await create_async_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        auth_response = await sign_in_client.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })

        if not auth_response.user or not auth_response.session:
            raise TokenValidationError("Invalid credentials")

        auth_id = str(auth_response.user.id)
        access_token = auth_response.session.access_token

        logger.info("User logged in", auth_id=auth_id, email=email)

        # Get user record from DB (direct query with admin client)
        user_response = await (
            admin_client.table("users")
            .select("*")
            .eq("auth_id", auth_id)
            .single()
            .execute()
        )

        user = user_response.data
        if not user:
            logger.error("User record not found after login", auth_id=auth_id)
            raise TokenValidationError("User account not properly configured")

        # Get organization
        org_id = _extract_org_id(user)

        org_response = await (
            admin_client.table("organizations")
            .select("*")
            .eq("id", str(org_id))
            .single()
            .execute()
        )
        org = org_response.data
        org_name = org.get("name", "") if org else ""
        normalized_org_type = _normalize_org_type((org or {}).get("org_type"))

        # Get primary property (first active one)
        props_response = await (
            admin_client.table("properties")
            .select("*")
            .eq("organization_id", str(org_id))
            .eq("is_active", True)
            .order("created_at")
            .limit(1)
            .execute()
        )
        primary_prop = props_response.data[0] if props_response.data else None
        has_properties = bool(props_response.data)

        # Backfill default_property_id if missing (users created before the fix).
        if primary_prop and not user.get("default_property_id"):
            try:
                await (
                    admin_client.table("users")
                    .update({"default_property_id": primary_prop["id"]})
                    .eq("id", user["id"])
                    .execute()
                )
                logger.info(
                    "Backfilled default_property_id on login",
                    user_id=user["id"],
                    property_id=primary_prop["id"],
                )
            except Exception as backfill_err:
                logger.warning("Could not backfill default_property_id", error=str(backfill_err))

        profile = ProfileResponse(
            user_id=UUID(user["id"]),
            email=user["email"],
            org_id=org_id,
            org_name=org_name,
            property_id=UUID(primary_prop["id"]) if primary_prop else None,
            property_name=primary_prop.get("name", "") if primary_prop else None,
            role=user["role"],
            org_type=normalized_org_type,
            workspace_experience=_resolve_workspace_experience(
                org_type=normalized_org_type,
                role=user["role"],
                has_properties=has_properties,
                has_scans=False,
                has_inventory_activity=False,
                onboarding_source=(org or {}).get("onboarding_source"),
            ),
            is_invited_user=_is_invited_user(user["role"]),
        )

        return LoginResponse(
            access_token=access_token,
            expires_in=auth_response.session.expires_in if auth_response.session else 3600,
            refresh_token=auth_response.session.refresh_token if auth_response.session else None,
            profile=profile,
        )

    async def provision_pilot_lead_conversion(
        self,
        *,
        email: str,
        org_name: str,
        property_name: str,
        contact_name: str | None = None,
        org_type: str | None = "FNB",
        role: str = "admin",
        plan: str = "FNB_GROWTH",
    ) -> dict[str, UUID]:
        admin_client = await get_async_supabase_admin()
        existing = await (
            admin_client.table("users")
            .select("*")
            .eq("email", email.lower())
            .limit(1)
            .execute()
        )
        if existing.data:
            user = existing.data[0]
            org_id = _extract_org_id(user)
            properties = await (
                admin_client.table("properties")
                .select("id")
                .eq("organization_id", str(org_id))
                .order("created_at")
                .limit(1)
                .execute()
            )
            if not properties.data:
                raise ValueError("Existing converted user is missing property")
            return {
                "user_id": UUID(str(user["id"])),
                "organization_id": org_id,
                "property_id": UUID(str(properties.data[0]["id"])),
            }

        temp_password = secrets.token_urlsafe(18)
        signup_response = await self.signup(
            SignupRequest(
                email=email.lower(),
                password=temp_password,
                org_name=org_name,
                property_name=property_name,
                org_type=org_type,
                role=role,
            )
        )
        await (
            admin_client.table("users")
            .update({"full_name": contact_name})
            .eq("id", str(signup_response.profile.user_id))
            .execute()
        )
        await (
            admin_client.table("organizations")
            .update({"plan": plan})
            .eq("id", str(signup_response.profile.org_id))
            .execute()
        )
        return {
            "user_id": signup_response.profile.user_id,
            "organization_id": signup_response.profile.org_id,
            "property_id": signup_response.profile.property_id,
        }

    async def get_google_user_profile(self, auth_id: str) -> "ProfileResponse | None":
        """Return the existing Neumas profile for a Google OAuth user, or None.

        Used by the /google/complete route to distinguish returning users
        (who need no onboarding) from first-time sign-ups.
        """
        admin_client = await get_async_supabase_admin()
        existing = await (
            admin_client.table("users")
            .select("*")
            .eq("auth_id", auth_id)
            .limit(1)
            .execute()
        )
        if not existing.data:
            return None

        user = existing.data[0]
        org_id = _extract_org_id(user)

        org_resp = await (
            admin_client.table("organizations")
            .select("name, org_type")
            .eq("id", str(org_id))
            .single()
            .execute()
        )
        fetched_org_name = org_resp.data.get("name", "") if org_resp.data else ""
        normalized_org_type = _normalize_org_type((org_resp.data or {}).get("org_type"))

        props = await (
            admin_client.table("properties")
            .select("id, name")
            .eq("organization_id", str(org_id))
            .eq("is_active", True)
            .order("created_at")
            .limit(1)
            .execute()
        )
        if not props.data:
            logger.info(
                "Google OAuth user exists but has no property yet; onboarding still required",
                auth_id=auth_id,
                org_id=str(org_id),
            )
            return None

        prop = props.data[0]
        return ProfileResponse(
            user_id=UUID(user["id"]),
            email=user["email"],
            org_id=org_id,
            org_name=fetched_org_name,
            property_id=UUID(prop["id"]),
            property_name=prop.get("name", ""),
            role=user["role"],
            org_type=normalized_org_type,
            workspace_experience=_resolve_workspace_experience(
                org_type=normalized_org_type,
                role=user["role"],
                has_properties=True,
                has_scans=False,
                has_inventory_activity=False,
                onboarding_source=(org_resp.data or {}).get("onboarding_source"),
            ),
            is_invited_user=_is_invited_user(user["role"]),
        )

    async def complete_google_signup(
        self,
        auth_id: str,
        email: str,
        org_name: str,
        property_name: str,
        org_type: str | None = None,
        property_type: str | None = None,
        role: str = "admin",
    ) -> ProfileResponse:
        """
        Create Neumas DB records for a user who signed up via Google OAuth.

        Called when the user has a Supabase Auth identity (auth_id) but no
        corresponding row in the `users` table.  Idempotent — if the user
        record already exists the existing profile is returned.

        Args:
            auth_id:       Supabase Auth user UUID (from JWT `sub` claim).
            email:         User email from Supabase.
            org_name:      Organization name chosen by the user.
            property_name: First property name chosen by the user.
            role:          Role to assign (default: admin for org creators).

        Returns:
            ProfileResponse with org_id, property_id, etc.
        """
        admin_client = await get_async_supabase_admin()
        normalized_org_type = _normalize_org_type(org_type)
        normalized_property_type = _normalize_org_type(property_type) or property_type

        # -- Idempotency check: user record may already exist -----------------
        existing = await (
            admin_client.table("users")
            .select("*")
            .eq("auth_id", auth_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            user = existing.data[0]
            user_id = UUID(user["id"])
            org_id = _extract_org_id(user)

            org_resp = await (
                admin_client.table("organizations")
                .select("name, org_type")
                .eq("id", str(org_id))
                .single()
                .execute()
            )
            fetched_org_name = org_resp.data.get("name", "") if org_resp.data else ""
            fetched_org_type = _normalize_org_type((org_resp.data or {}).get("org_type"))

            props = await (
                admin_client.table("properties")
                .select("id, name")
                .eq("organization_id", str(org_id))
                .eq("is_active", True)
                .order("created_at")
                .limit(1)
                .execute()
            )
            if props.data:
                prop = props.data[0]
            else:
                logger.warning(
                    "Google signup: repairing existing user missing property",
                    auth_id=auth_id,
                    org_id=str(org_id),
                    property_name=property_name,
                )
                prop = await self._insert_property_row(
                    org_id,
                    {
                        "name": property_name,
                        "type": "hotel",
                        "property_type": normalized_property_type,
                        "onboarding_order": 1,
                        "is_primary": True,
                    },
                )
                if not prop:
                    raise ValueError("Failed to create property for existing Google user")
                # Back-fill default_property_id so /me stops returning 403
                await admin_client.table("users").update({
                    "default_property_id": str(prop["id"]),
                }).eq("id", str(user["id"])).execute()

            return ProfileResponse(
                user_id=user_id,
                email=user["email"],
                org_id=org_id,
                org_name=fetched_org_name,
                property_id=UUID(prop["id"]),
                property_name=prop.get("name", ""),
                role=user["role"],
                org_type=fetched_org_type,
            workspace_experience=_resolve_workspace_experience(
                org_type=fetched_org_type,
                role=user["role"],
                has_properties=True,
                has_scans=False,
                has_inventory_activity=False,
                onboarding_source=(org_resp.data or {}).get("onboarding_source"),
            ),
                is_invited_user=_is_invited_user(user["role"]),
            )

        # -- Create org, property, user ----------------------------------------
        created_org_id: UUID | None = None
        created_property_id: UUID | None = None
        try:
            org_slug = generate_slug(org_name)

            org_resp = await admin_client.table("organizations").insert({
                "name": org_name,
                "slug": org_slug,
                "org_type": normalized_org_type,
                "onboarding_status": "IN_PROGRESS",
                "onboarding_started_at": _utcnow(),
                "onboarding_version": 1,
                "onboarding_source": "google_oauth",
            }).execute()
            if not org_resp.data:
                raise ValueError("Failed to create organization")
            org_id = UUID(org_resp.data[0]["id"])
            created_org_id = org_id
            logger.info("Google signup: org created", org_id=str(org_id))

            prop = await self._insert_property_row(
                org_id,
                {
                    "name": property_name,
                    "type": "hotel",
                    "property_type": normalized_property_type,
                    "onboarding_order": 1,
                    "is_primary": True,
                },
            )
            if not prop:
                raise ValueError("Failed to create property")
            property_id = UUID(prop["id"])
            created_property_id = property_id
            logger.info("Google signup: property created", property_id=str(property_id))

            insert_errors: list[str] = []
            user_resp = None
            for payload in _build_user_insert_payload_variants(
                auth_id=auth_id,
                email=email,
                org_id=org_id,
                property_id=property_id,
                role=role,
            ):
                try:
                    user_resp = await admin_client.table("users").insert(payload).execute()
                    if user_resp.data:
                        break
                except Exception as exc:
                    insert_errors.append(str(exc))
                    continue
            if not user_resp or not user_resp.data:
                raise ValueError(
                    "Failed to create user record"
                    + (f": {' | '.join(insert_errors)}" if insert_errors else "")
                )
            user_id = UUID(user_resp.data[0]["id"])
            logger.info("Google signup: user record created", user_id=str(user_id))

        except Exception:
            logger.error("Google signup failed", auth_id=auth_id)
            if created_property_id is not None:
                try:
                    await (
                        admin_client.table("properties")
                        .delete()
                        .eq("id", str(created_property_id))
                        .execute()
                    )
                except Exception as cleanup_exc:
                    logger.warning(
                        "Google signup property cleanup failed",
                        property_id=str(created_property_id),
                        error=str(cleanup_exc),
                    )
            if created_org_id is not None:
                try:
                    await (
                        admin_client.table("organizations")
                        .delete()
                        .eq("id", str(created_org_id))
                        .execute()
                    )
                except Exception as cleanup_exc:
                    logger.warning(
                        "Google signup organization cleanup failed",
                        org_id=str(created_org_id),
                        error=str(cleanup_exc),
                    )
            raise

        return ProfileResponse(
            user_id=user_id,
            email=email,
            org_id=org_id,
            org_name=org_name,
            property_id=property_id,
            property_name=property_name,
            role=role,
            org_type=normalized_org_type,
            workspace_experience=(
                "INVITED" if _is_invited_user(role) and normalized_org_type else
                normalized_org_type if normalized_org_type in {"FNB", "HOUSEHOLD"} else
                "NEEDS_PERSONA"
            ),
            is_invited_user=_is_invited_user(role),
        )

    async def get_onboarding_state(self, user: UserInfo) -> OnboardingStateResponse:
        admin_client = await get_async_supabase_admin()

        org_response = await (
            admin_client.table("organizations")
            .select("*")
            .eq("id", str(user.organization_id))
            .single()
            .execute()
        )
        org = org_response.data or {}
        normalized_org_type = _normalize_org_type(org.get("org_type"))
        normalized_business_type = _normalize_business_type(org.get("business_type"))
        settings = self._coerce_settings(org.get("settings"))

        property_id = user.default_property_id
        prop: dict[str, Any] | None = None
        has_properties = False
        if property_id:
            prop_response = await (
                admin_client.table("properties")
                .select("*")
                .eq("id", str(property_id))
                .eq("organization_id", str(user.organization_id))
                .limit(1)
                .execute()
            )
            if prop_response.data:
                prop = prop_response.data[0]
                has_properties = True
        properties = await self._list_properties_for_org(user.organization_id)
        if not has_properties:
            has_properties = bool(properties)

        scans_response = await (
            admin_client.table("scans")
            .select("id", count="exact")
            .eq("organization_id", str(user.organization_id))
            .limit(1)
            .execute()
        )
        has_scans = bool(getattr(scans_response, "count", None) or scans_response.data)

        movements_response = await (
            admin_client.table("inventory_movements")
            .select("id", count="exact")
            .eq("organization_id", str(user.organization_id))
            .limit(1)
            .execute()
        )
        has_inventory_activity = bool(
            getattr(movements_response, "count", None) or movements_response.data
        )
        counts = await self._get_org_activity_counts(user.organization_id)
        milestones, persisted_milestones = self._resolve_activation_milestones(
            org=org,
            settings=settings,
            counts=counts,
        )
        if persisted_milestones != self._coerce_activation_milestones(org.get("activation_milestones")):
            await (
                admin_client.table("organizations")
                .update({"activation_milestones": persisted_milestones})
                .eq("id", str(user.organization_id))
                .execute()
            )

        status = str(org.get("onboarding_status") or "NOT_STARTED")
        dashboard_unlocked = milestones.business_setup_completed and milestones.first_property_created
        is_complete = (
            status in {"ACTIVATED", "SKIPPED"}
            or has_scans
            or has_inventory_activity
            or dashboard_unlocked
        )
        workspace_experience = _resolve_workspace_experience(
            org_type=normalized_org_type,
            role=user.role,
            has_properties=has_properties,
            has_scans=has_scans,
            has_inventory_activity=has_inventory_activity,
            onboarding_source=org.get("onboarding_source"),
        )
        outlets = [
            OnboardingOutletResponse(
                property_id=UUID(str(row["id"])),
                onboarding_key=row.get("onboarding_key"),
                name=row.get("name") or "",
                property_type=row.get("property_type") or row.get("type"),
                address=row.get("address"),
                is_primary=bool(row.get("is_primary") or False),
                onboarding_order=row.get("onboarding_order"),
            )
            for row in properties
        ]
        checklist = self._build_activation_checklist(
            milestones,
            vendor_count=counts["vendors"],
            documents_review_pending=counts["documents_review_pending"],
            org_type=normalized_org_type,
        )

        return OnboardingStateResponse(
            organization_id=user.organization_id,
            property_id=property_id,
            org_type=normalized_org_type,
            business_type=normalized_business_type,
            workspace_experience=workspace_experience,
            is_invited_user=_is_invited_user(user.role),
            has_properties=has_properties,
            target_outlet_count=int((settings.get("target_outlet_count") or 0) or 0) or None,
            household_profile=self._build_household_profile(settings, org.get("name")),
            outlets=outlets,
            activation_milestones=milestones,
            activation_checklist=checklist,
            dashboard_unlocked=dashboard_unlocked,
            property_type=(prop or {}).get("property_type"),
            address=(prop or {}).get("address"),
            onboarding_status=status,
            onboarding_started_at=org.get("onboarding_started_at"),
            onboarding_completed_at=org.get("onboarding_completed_at"),
            onboarding_version=int(org.get("onboarding_version") or 1),
            onboarding_source=org.get("onboarding_source"),
            country=org.get("country"),
            currency=org.get("currency"),
            has_scans=has_scans,
            has_inventory_activity=has_inventory_activity,
            is_complete=is_complete,
            requires_onboarding=(
                not dashboard_unlocked
                and workspace_experience not in {"INVITED", "LEGACY_FNB"}
            ),
        )

    async def update_onboarding_state(
        self,
        user: UserInfo,
        update: OnboardingStateUpdate,
    ) -> OnboardingStateResponse:
        if update.onboarding_status == "ACTIVATED":
            return await self.mark_onboarding_activated(
                user,
                onboarding_source=update.onboarding_source,
                org_type=update.org_type,
                business_type=update.business_type,
                org_name=update.org_name,
                country=update.country,
                currency=update.currency,
                outlet_count=update.outlet_count,
                household_size=update.household_size,
                shopping_frequency=update.shopping_frequency,
                favorite_stores=update.favorite_stores,
                waste_reduction_goal=update.waste_reduction_goal,
                monthly_grocery_budget=update.monthly_grocery_budget,
                dietary_preferences=update.dietary_preferences,
                data_start_choice=update.data_start_choice,
                idempotency_key=update.idempotency_key,
                outlets=update.outlets,
                property_name=update.property_name,
                property_type=update.property_type,
                address=update.address,
            )
        if update.onboarding_status == "SKIPPED":
            return await self.mark_onboarding_skipped(
                user,
                onboarding_source=update.onboarding_source,
                org_type=update.org_type,
                business_type=update.business_type,
                org_name=update.org_name,
                country=update.country,
                currency=update.currency,
                outlet_count=update.outlet_count,
                household_size=update.household_size,
                shopping_frequency=update.shopping_frequency,
                favorite_stores=update.favorite_stores,
                waste_reduction_goal=update.waste_reduction_goal,
                monthly_grocery_budget=update.monthly_grocery_budget,
                dietary_preferences=update.dietary_preferences,
                data_start_choice=update.data_start_choice,
                idempotency_key=update.idempotency_key,
                outlets=update.outlets,
                property_name=update.property_name,
                property_type=update.property_type,
                address=update.address,
            )
        return await self.mark_onboarding_started(
            user,
            onboarding_source=update.onboarding_source,
            org_type=update.org_type,
            business_type=update.business_type,
            org_name=update.org_name,
            country=update.country,
            currency=update.currency,
            outlet_count=update.outlet_count,
            household_size=update.household_size,
            shopping_frequency=update.shopping_frequency,
            favorite_stores=update.favorite_stores,
            waste_reduction_goal=update.waste_reduction_goal,
            monthly_grocery_budget=update.monthly_grocery_budget,
            dietary_preferences=update.dietary_preferences,
            data_start_choice=update.data_start_choice,
            idempotency_key=update.idempotency_key,
            outlets=update.outlets,
            property_name=update.property_name,
            property_type=update.property_type,
            address=update.address,
        )

    async def mark_onboarding_started(
        self,
        user: UserInfo,
        *,
        onboarding_source: str | None = None,
        org_type: str | None = None,
        business_type: str | None = None,
        org_name: str | None = None,
        country: str | None = None,
        currency: str | None = None,
        outlet_count: int | None = None,
        household_size: int | None = None,
        shopping_frequency: str | None = None,
        favorite_stores: list[str] | None = None,
        waste_reduction_goal: str | None = None,
        monthly_grocery_budget: float | None = None,
        dietary_preferences: list[str] | None = None,
        data_start_choice: str | None = None,
        idempotency_key: str | None = None,
        outlets: list[OnboardingOutletInput] | None = None,
        property_name: str | None = None,
        property_type: str | None = None,
        address: str | None = None,
    ) -> OnboardingStateResponse:
        current = await self.get_onboarding_state(user)
        admin_client = await get_async_supabase_admin()
        org_update: dict[str, Any] = {"onboarding_status": "IN_PROGRESS"}
        if current.onboarding_started_at is None:
            org_update["onboarding_started_at"] = _utcnow()
        if onboarding_source:
            org_update["onboarding_source"] = onboarding_source
        if org_type is not None:
            org_update["org_type"] = _normalize_org_type(org_type)
        if business_type is not None:
            org_update["business_type"] = _normalize_business_type(business_type)
        if org_name is not None:
            org_update["name"] = org_name
        if country is not None:
            org_update["country"] = country
        if currency is not None:
            org_update["currency"] = currency
        await (
            admin_client.table("organizations")
            .update(org_update)
            .eq("id", str(user.organization_id))
            .execute()
        )
        await self._update_activation_settings(
            user.organization_id,
            outlet_count=outlet_count,
            household_size=household_size,
            shopping_frequency=shopping_frequency,
            favorite_stores=favorite_stores,
            waste_reduction_goal=waste_reduction_goal,
            monthly_grocery_budget=monthly_grocery_budget,
            dietary_preferences=dietary_preferences,
            data_start_choice=data_start_choice,
        )
        await self._sync_onboarding_outlets(
            user,
            outlets=outlets or [],
            idempotency_key=idempotency_key,
        )
        await self._update_primary_property_metadata(
            user,
            property_name=property_name,
            property_type=property_type,
            address=address,
        )
        return await self.get_onboarding_state(user)

    async def mark_onboarding_activated(
        self,
        user: UserInfo,
        *,
        onboarding_source: str | None = None,
        org_type: str | None = None,
        business_type: str | None = None,
        org_name: str | None = None,
        country: str | None = None,
        currency: str | None = None,
        outlet_count: int | None = None,
        household_size: int | None = None,
        shopping_frequency: str | None = None,
        favorite_stores: list[str] | None = None,
        waste_reduction_goal: str | None = None,
        monthly_grocery_budget: float | None = None,
        dietary_preferences: list[str] | None = None,
        data_start_choice: str | None = None,
        idempotency_key: str | None = None,
        outlets: list[OnboardingOutletInput] | None = None,
        property_name: str | None = None,
        property_type: str | None = None,
        address: str | None = None,
    ) -> OnboardingStateResponse:
        current = await self.get_onboarding_state(user)
        admin_client = await get_async_supabase_admin()
        org_update: dict[str, Any] = {
            "onboarding_status": "ACTIVATED",
            "onboarding_completed_at": _utcnow(),
        }
        if current.onboarding_started_at is None:
            org_update["onboarding_started_at"] = _utcnow()
        if onboarding_source:
            org_update["onboarding_source"] = onboarding_source
        if org_type is not None:
            org_update["org_type"] = _normalize_org_type(org_type)
        if business_type is not None:
            org_update["business_type"] = _normalize_business_type(business_type)
        if org_name is not None:
            org_update["name"] = org_name
        if country is not None:
            org_update["country"] = country
        if currency is not None:
            org_update["currency"] = currency
        await (
            admin_client.table("organizations")
            .update(org_update)
            .eq("id", str(user.organization_id))
            .execute()
        )
        await self._update_activation_settings(
            user.organization_id,
            outlet_count=outlet_count,
            household_size=household_size,
            shopping_frequency=shopping_frequency,
            favorite_stores=favorite_stores,
            waste_reduction_goal=waste_reduction_goal,
            monthly_grocery_budget=monthly_grocery_budget,
            dietary_preferences=dietary_preferences,
            data_start_choice=data_start_choice,
        )
        await self._sync_onboarding_outlets(
            user,
            outlets=outlets or [],
            idempotency_key=idempotency_key,
        )
        await self._update_primary_property_metadata(
            user,
            property_name=property_name,
            property_type=property_type,
            address=address,
        )
        return await self.get_onboarding_state(user)

    async def mark_onboarding_skipped(
        self,
        user: UserInfo,
        *,
        onboarding_source: str | None = None,
        org_type: str | None = None,
        business_type: str | None = None,
        org_name: str | None = None,
        country: str | None = None,
        currency: str | None = None,
        outlet_count: int | None = None,
        household_size: int | None = None,
        shopping_frequency: str | None = None,
        favorite_stores: list[str] | None = None,
        waste_reduction_goal: str | None = None,
        monthly_grocery_budget: float | None = None,
        dietary_preferences: list[str] | None = None,
        data_start_choice: str | None = None,
        idempotency_key: str | None = None,
        outlets: list[OnboardingOutletInput] | None = None,
        property_name: str | None = None,
        property_type: str | None = None,
        address: str | None = None,
    ) -> OnboardingStateResponse:
        current = await self.get_onboarding_state(user)
        admin_client = await get_async_supabase_admin()
        org_update: dict[str, Any] = {
            "onboarding_status": "SKIPPED",
            "onboarding_completed_at": _utcnow(),
        }
        if current.onboarding_started_at is None:
            org_update["onboarding_started_at"] = _utcnow()
        if onboarding_source:
            org_update["onboarding_source"] = onboarding_source
        if org_type is not None:
            org_update["org_type"] = _normalize_org_type(org_type)
        if business_type is not None:
            org_update["business_type"] = _normalize_business_type(business_type)
        if org_name is not None:
            org_update["name"] = org_name
        if country is not None:
            org_update["country"] = country
        if currency is not None:
            org_update["currency"] = currency
        await (
            admin_client.table("organizations")
            .update(org_update)
            .eq("id", str(user.organization_id))
            .execute()
        )
        await self._update_activation_settings(
            user.organization_id,
            outlet_count=outlet_count,
            household_size=household_size,
            shopping_frequency=shopping_frequency,
            favorite_stores=favorite_stores,
            waste_reduction_goal=waste_reduction_goal,
            monthly_grocery_budget=monthly_grocery_budget,
            dietary_preferences=dietary_preferences,
            data_start_choice=data_start_choice,
        )
        await self._sync_onboarding_outlets(
            user,
            outlets=outlets or [],
            idempotency_key=idempotency_key,
        )
        await self._update_primary_property_metadata(
            user,
            property_name=property_name,
            property_type=property_type,
            address=address,
        )
        return await self.get_onboarding_state(user)

    async def _update_activation_settings(
        self,
        organization_id: UUID,
        *,
        outlet_count: int | None = None,
        household_size: int | None = None,
        shopping_frequency: str | None = None,
        favorite_stores: list[str] | None = None,
        waste_reduction_goal: str | None = None,
        monthly_grocery_budget: float | None = None,
        dietary_preferences: list[str] | None = None,
        data_start_choice: str | None = None,
    ) -> None:
        if (
            outlet_count is None
            and household_size is None
            and shopping_frequency is None
            and favorite_stores is None
            and waste_reduction_goal is None
            and monthly_grocery_budget is None
            and dietary_preferences is None
            and data_start_choice is None
        ):
            return

        def mutate(current: dict[str, Any]) -> dict[str, Any]:
            if outlet_count is not None:
                current["target_outlet_count"] = outlet_count
            if household_size is not None:
                current["household_size"] = household_size
            if shopping_frequency is not None:
                current["shopping_frequency"] = shopping_frequency
            if favorite_stores is not None:
                current["favorite_stores"] = [
                    str(store).strip() for store in favorite_stores if str(store).strip()
                ]
            if waste_reduction_goal is not None:
                current["waste_reduction_goal"] = waste_reduction_goal
            if monthly_grocery_budget is not None:
                current["monthly_grocery_budget"] = monthly_grocery_budget
            if dietary_preferences is not None:
                current["dietary_preferences"] = [
                    str(pref).strip() for pref in dietary_preferences if str(pref).strip()
                ]
            if data_start_choice is not None:
                current["data_start_choice"] = data_start_choice
            return current

        await self._update_organization_settings(organization_id, mutate)

    async def _sync_onboarding_outlets(
        self,
        user: UserInfo,
        *,
        outlets: list[OnboardingOutletInput],
        idempotency_key: str | None,
    ) -> None:
        if not outlets:
            return

        admin_client = await get_async_supabase_admin()
        try:
            existing_response = await (
                admin_client.table("properties")
                .select("*")
                .eq("organization_id", str(user.organization_id))
                .order("created_at", desc=False)
                .execute()
            )
            existing_rows = existing_response.data or []
        except Exception as exc:
            if not _is_property_schema_compat_error(exc):
                raise
            logger.warning(
                "Falling back to legacy outlet sync read for onboarding compatibility",
                organization_id=str(user.organization_id),
                error=str(exc),
            )
            existing_rows = []
        existing_by_key = {
            str(row.get("onboarding_key")): row
            for row in existing_rows
            if row.get("onboarding_key")
        }
        fallback_primary = existing_rows[0] if existing_rows else None
        chosen_primary_index = next(
            (index for index, outlet in enumerate(outlets) if outlet.is_primary),
            0,
        )

        for index, outlet in enumerate(outlets):
            outlet_key = outlet.onboarding_key or (
                f"{idempotency_key}:{index}" if idempotency_key else f"outlet:{index}"
            )
            payload = {
                "name": outlet.name,
                "property_type": outlet.property_type,
                "type": _property_type_slug(outlet.property_type),
                "address": outlet.address,
                "onboarding_key": outlet_key,
                "onboarding_order": index + 1,
                "is_primary": index == chosen_primary_index,
            }

            existing = existing_by_key.get(outlet_key)
            if existing:
                await self._update_property_row(
                    user.organization_id,
                    str(existing["id"]),
                    payload,
                )
                continue

            if index == 0 and fallback_primary and not fallback_primary.get("onboarding_key"):
                await self._update_property_row(
                    user.organization_id,
                    str(fallback_primary["id"]),
                    payload,
                )
                existing_by_key[outlet_key] = {**fallback_primary, **payload}
                continue

            inserted = await self._insert_property_row(user.organization_id, payload)
            if inserted:
                existing_by_key[outlet_key] = inserted

    async def _update_primary_property_metadata(
        self,
        user: UserInfo,
        *,
        property_name: str | None = None,
        property_type: str | None = None,
        address: str | None = None,
    ) -> None:
        if not user.default_property_id:
            return
        payload: dict[str, Any] = {}
        if property_name is not None:
            payload["name"] = property_name
        if property_type is not None:
            payload["property_type"] = property_type
            payload["type"] = _property_type_slug(property_type)
        if address is not None:
            payload["address"] = address
        if not payload:
            return
        admin_client = await get_async_supabase_admin()
        await (
            admin_client.table("properties")
            .update(payload)
            .eq("id", str(user.default_property_id))
            .eq("organization_id", str(user.organization_id))
            .execute()
        )

    async def refresh_session(self, refresh_token: str) -> "TokenResponse":
        """
        Exchange a Supabase refresh token for a new access token.

        Supabase handles refresh token rotation — a new refresh token is
        returned alongside the new access token. The old refresh token is
        invalidated by Supabase after use.

        Returns:
            TokenResponse with new access_token, refresh_token, and expires_in.

        Raises:
            TokenValidationError: If the refresh token is invalid or expired.
        """
        from app.schemas.auth import TokenResponse

        # Use a transient client to avoid mutating the singleton admin client's session.
        refresh_client = await create_async_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY or settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        try:
            response = await refresh_client.auth.refresh_session(refresh_token)
        except Exception as e:
            logger.warning("Token refresh failed", error=str(e))
            raise TokenValidationError("Refresh token is invalid or expired") from e

        if not response.session:
            raise TokenValidationError("Refresh returned no session")

        session = response.session
        logger.info("Session refreshed", user_id=str(response.user.id) if response.user else "unknown")

        return TokenResponse(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            expires_in=session.expires_in or 3600,
            token_type="bearer",
        )


async def get_auth_service() -> AuthService:
    """Get auth service instance."""
    return AuthService()
