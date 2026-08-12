"""
Authentication service for user authentication and authorization.
"""

import re
import secrets
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
    CurrentUserContext,
    LoginResponse,
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
                prop_resp = await admin_client.table("properties").insert({
                    "organization_id": str(org_id),
                    "name": property_name,
                    "type": "hotel",
                    "property_type": normalized_property_type,
                    "onboarding_order": 1,
                    "is_primary": True,
                }).execute()
                if not prop_resp.data:
                    raise ValueError("Failed to create property for existing Google user")
                prop = prop_resp.data[0]
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

            prop_resp = await admin_client.table("properties").insert({
                "organization_id": str(org_id),
                "name": property_name,
                "type": "hotel",
                "property_type": normalized_property_type,
                "onboarding_order": 1,
                "is_primary": True,
            }).execute()
            if not prop_resp.data:
                raise ValueError("Failed to create property")
            property_id = UUID(prop_resp.data[0]["id"])
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
        if not has_properties:
            props_response = await (
                admin_client.table("properties")
                .select("id")
                .eq("organization_id", str(user.organization_id))
                .eq("is_active", True)
                .limit(1)
                .execute()
            )
            has_properties = bool(props_response.data)

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

        status = str(org.get("onboarding_status") or "NOT_STARTED")
        is_complete = status in {"ACTIVATED", "SKIPPED"} or has_scans or has_inventory_activity
        workspace_experience = _resolve_workspace_experience(
            org_type=normalized_org_type,
            role=user.role,
            has_properties=has_properties,
            has_scans=has_scans,
            has_inventory_activity=has_inventory_activity,
            onboarding_source=org.get("onboarding_source"),
        )

        return OnboardingStateResponse(
            organization_id=user.organization_id,
            property_id=property_id,
            org_type=normalized_org_type,
            workspace_experience=workspace_experience,
            is_invited_user=_is_invited_user(user.role),
            has_properties=has_properties,
            property_type=(prop or {}).get("property_type"),
            address=(prop or {}).get("address"),
            onboarding_status=status,  # type: ignore[arg-type]
            onboarding_started_at=org.get("onboarding_started_at"),
            onboarding_completed_at=org.get("onboarding_completed_at"),
            onboarding_version=int(org.get("onboarding_version") or 1),
            onboarding_source=org.get("onboarding_source"),
            country=org.get("country"),
            currency=org.get("currency"),
            has_scans=has_scans,
            has_inventory_activity=has_inventory_activity,
            is_complete=is_complete,
            requires_onboarding=not is_complete and workspace_experience != "INVITED",
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
                org_name=update.org_name,
                country=update.country,
                currency=update.currency,
                property_name=update.property_name,
                property_type=update.property_type,
                address=update.address,
            )
        if update.onboarding_status == "SKIPPED":
            return await self.mark_onboarding_skipped(
                user,
                onboarding_source=update.onboarding_source,
                org_type=update.org_type,
                org_name=update.org_name,
                country=update.country,
                currency=update.currency,
                property_name=update.property_name,
                property_type=update.property_type,
                address=update.address,
            )
        return await self.mark_onboarding_started(
            user,
            onboarding_source=update.onboarding_source,
            org_type=update.org_type,
            org_name=update.org_name,
            country=update.country,
            currency=update.currency,
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
        org_name: str | None = None,
        country: str | None = None,
        currency: str | None = None,
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
        org_name: str | None = None,
        country: str | None = None,
        currency: str | None = None,
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
        org_name: str | None = None,
        country: str | None = None,
        currency: str | None = None,
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
        await self._update_primary_property_metadata(
            user,
            property_name=property_name,
            property_type=property_type,
            address=address,
        )
        return await self.get_onboarding_state(user)

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
            payload["property_type"] = _normalize_org_type(property_type) or property_type
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
