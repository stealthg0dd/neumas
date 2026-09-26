# Production Recovery - 2026-09-27

## Current Code State

- Recovery branch: `fix/production-recovery-2026-09-27`
- Base production branch at takeover: `main`
- Current HEAD: `c62466a57bd1f18b48b0ede97f52243b0f9f2d6e`
- `origin/main`: `c62466a57bd1f18b48b0ede97f52243b0f9f2d6e`
- Remote: `origin https://github.com/stealthg0dd/neumas.git`
- Working tree: clean tracked files; preserved untracked audit/build-plan docs remain:
  - `CODEBASE_AUDIT_2026-09-25.md`
  - `docs/AUTONOMOUS_OPERATIONS_AUDIT.md`
  - `docs/AUTONOMOUS_OPERATIONS_BUILD_PLAN.md`

## Production Correspondence

- Latest web deploy on `main` succeeded for `c62466a` via GitHub Actions `Deploy Web` run `36211591043`.
- Latest CI on `main` succeeded for `c62466a` via run `36211591063`.
- Backend/worker deploy succeeded for autonomous release commit `4fcf6f9` via `Deploy Worker` run `36211376741`.
- The latest commit `c62466a` only changed public SEO routing/audit files, so it did not trigger the backend deploy workflow.
- Live smoke from 2026-09-26 showed:
  - `https://www.neumas.cc/api/health`: `200`, backend `ok`, Supabase `ok`, Redis `ok`
  - `https://neumas-production.up.railway.app/health`: `200`
  - `https://neumas-production.up.railway.app/ready`: `200`, Supabase `true`, Redis `true`
  - `/dashboard`: unauthenticated redirect to `/auth?next=%2Fdashboard`
  - `/api/control-center/summary`: unauthenticated `401 Missing authentication token`

## Previous Autonomous Procurement Work

The autonomous-procurement branch work was merged to `main`.

Relevant commits now on `main`:

- `6f48164 feat(control-center): add autonomous procurement operator shell`
- `8aa2f7a feat(food-graph): add canonical ingredients recipes and costing`
- `c6fa620 feat(demand): add canonical demand forecasting and imports`
- `212ebde feat(procurement): add supplier intelligence and optimizer`
- `498d0f1 feat(autonomy): add policy decision action and agent center`
- `7c57747 feat(purchasing): add purchase orders receiving and reconciliation`
- `7e56a35 feat(margin): add margin control waste and outcome learning`
- `b9ae768 feat(integrations): add canonical connector gateway and square xero adapters`
- `7ce698b feat(marketing): reposition neumas around autonomous procurement and margin control`
- `4fcf6f9 chore(release): validate autonomous procurement release gates`
- `c62466a fix(marketing): restore public SEO route audit`

## Recently Built Surface

- Dashboard/control center:
  - Backend: `app/api/routes/control_center.py`, `app/services/control_center_service.py`
  - Frontend: `src/app/dashboard/page.tsx`, control-center components, navigation
- Food graph/recipes:
  - Backend: `food_graph.py`, `food_graph_service.py`, migration `202609250001_food_graph.sql`
  - Frontend: `/dashboard/recipes`, `/dashboard/recipes/[id]`
- Demand:
  - Backend: `demand.py`, `demand_service.py`, migration `202609250002_demand_intelligence.sql`
  - Frontend: `/dashboard/demand`
- Procurement/suppliers:
  - Backend: `procurement.py`, `procurement_optimizer_service.py`, migration `202609250003_supplier_intelligence_procurement.sql`
  - Frontend: `/dashboard/procurement/*`
- Autonomy/agents/decisions:
  - Backend: `autonomy.py`, `autonomy_service.py`, migration `202609250004_autonomy_decision_action.sql`
  - Frontend: `/dashboard/agent-center`, `/dashboard/decisions`
- Purchasing/invoices/exceptions:
  - Backend: `purchasing.py`, `purchasing_service.py`, migration `202609250005_purchasing_lifecycle_reconciliation.sql`
  - Frontend: purchase orders, deliveries, invoices, exceptions
- Margin/waste/outcomes:
  - Backend: `margin.py`, `margin_service.py`, migration `202609250006_margin_waste_outcomes.sql`
  - Frontend: `/dashboard/margin`, `/dashboard/waste`
- Integrations:
  - Backend: connector gateway, Square/Xero adapters, migration `202609250007_connector_gateway_square_xero.sql`
  - Frontend: `/dashboard/integrations`
- RLS release hardening:
  - Migration `202609250008_autonomous_procurement_rls_policies.sql`

## Open Recovery Work

- Trace new-user onboarding end to end.
- Diagnose production dashboard failures, especially `/dashboard/reports` showing document/report load failures.
- Compare code expectations against deployed database tables and migrations.
- Add durable onboarding state if missing.
- Add data-readiness service and route.
- Repair empty/setup/partial/error states without masking true server errors.
- Verify or classify each domain pipeline transition as `LIVE`, `PARTIAL`, `BROKEN`, or `MISSING`.

## Focused Findings - 2026-09-27

### Onboarding / Tenant Context

- Existing onboarding state is spread across `organizations`, `properties`, `users.default_property_id`, frontend local storage, and activation milestone settings.
- There was no first-class `organization_onboarding` state-machine table with the requested stages.
- Email/password signup currently creates:
  - Supabase auth user
  - organization row
  - primary property row
  - users row with organization/default property variants
  - organization onboarding columns set to `IN_PROGRESS`
- Google OAuth callback:
  - if `/api/auth/me` succeeds, redirects to requested dashboard path with bootstrap cookie
  - if `/api/auth/me` fails because the backend profile does not exist, redirects to `/onboard?supabase_jwt=...`
  - `/onboard` then calls `/api/auth/google/complete` after persona selection
- Tenant context resolves active property from `users.default_property_id`, then falls back to the first active property in the user's own organization.
- Repair made:
  - invalid, deleted, inactive, cross-org, or unvalidated default properties are not silently accepted
  - when a valid active fallback property exists for the user's org, it is used for the current request
  - the fallback property is backfilled to `users.default_property_id` on a best-effort basis
  - orgs with no active properties continue with `property_id = null` so property-required endpoints can fail explicitly
- Durable onboarding transitions now route through `OrganizationOnboardingService`.
- `GET /api/data-readiness` exposes:
  - `overall_readiness`
  - `readiness_tier` (`TIER_0` through `TIER_4`)
  - `capability_readiness` for inventory, demand, procurement, and margin
- Readiness checks best-effort sync `organization_onboarding` from real tenant data without allowing stage downgrades.

### Reports Failure Path

- `/dashboard/reports` frontend requests:
  - `GET /api/reports`
  - `GET /api/auth/entitlements`
  - `SpendSummary` separately requests `GET /api/documents`
- Backend routes:
  - `/api/reports` -> `ReportService` -> `ReportsRepository` -> `reports`
  - `/api/documents` -> `DocumentService` -> `DocumentsRepository` -> `documents`
- Both routes use authenticated `TenantContext` and explicit `organization_id` filters; documents additionally filter `property_id` when available.
- Frontend problem confirmed:
  - `SpendSummary` displayed hardcoded `Failed to load documents` for any exception.
  - Reports page displayed hardcoded `Failed to load reports` for any exception.
  - Empty document spend rendered blank columns with no CTA.
- Repair made:
  - Missing invoice/document data now renders actionable setup state:
    - upload invoice
    - review documents
  - Genuine API failures now show the normalized server/network error and a retry button.

## Changes Added On Recovery Branch

- Migration:
  - `neumas-backend/supabase/migrations/202609270001_production_recovery_onboarding_readiness.sql`
  - Adds `organization_onboarding` with stages:
    - `ACCOUNT_CREATED`
    - `ORGANIZATION_CREATED`
    - `LOCATION_CREATED`
    - `OPERATING_PROFILE_SET`
    - `DATA_SOURCE_SELECTED`
    - `DATA_CONNECTED`
    - `BASELINE_PROCESSING`
    - `READY`
- Backend:
  - `DataReadinessService`
  - `GET /api/data-readiness`
  - `OrganizationOnboardingService`
  - Auth service best-effort sync to `organization_onboarding`
  - Tenant context default-property bootstrap repair
- Frontend:
  - `DataReadinessResponse` API type
  - `getDataReadiness()`
  - `/dashboard/setup` readiness-driven setup hub
  - downloadable CSV templates for inventory, sales, suppliers, supplier prices, recipes, recipe ingredients, and invoices
  - `/dashboard/reports` checks readiness before showing no-data setup state
  - `SpendSummary` has no-data CTAs and real error display
- Tests:
  - `neumas-backend/tests/test_data_readiness.py`
  - `neumas-backend/tests/test_organization_onboarding_service.py`
  - `neumas-backend/tests/test_property_and_shopping_consistency.py`

## Verification - 2026-09-27

- Backend targeted:
  - `ruff check app/api/routes/data_readiness.py app/schemas/data_readiness.py app/services/data_readiness_service.py app/services/auth_service.py tests/test_data_readiness.py app/main.py` passed
  - `py_compile app/api/routes/data_readiness.py app/services/data_readiness_service.py app/services/auth_service.py app/main.py` passed
  - `pytest tests/test_data_readiness.py -q` passed, 2 tests
  - `ruff check app/api/deps.py tests/test_property_and_shopping_consistency.py` passed
  - `pytest tests/test_property_and_shopping_consistency.py -q` passed, 8 tests
  - `ruff check app/schemas/data_readiness.py app/services/data_readiness_service.py app/services/organization_onboarding_service.py app/services/auth_service.py tests/test_data_readiness.py tests/test_organization_onboarding_service.py` passed
  - `pytest tests/test_data_readiness.py tests/test_organization_onboarding_service.py -q` passed, 4 tests
- Frontend targeted:
  - `pnpm lint` passed
  - `pnpm exec tsc --noEmit` passed
  - `pnpm exec tsc --noEmit` passed after readiness contract update
  - `pnpm lint` passed after setup hub addition
  - `pnpm exec tsc --noEmit` passed after setup hub addition
  - `pnpm exec vitest run src/__tests__/setup-hub.test.tsx` passed, 1 test
  - `pnpm exec vitest run src/__tests__/navigation.test.ts src/__tests__/setup-hub.test.tsx` passed, 7 tests

## Not Yet Verified

- Fresh account through browser UI.
- Production authenticated account dashboard state.
- Whether all new autonomous migrations have been applied in the production database.
- Full page-by-page API failure matrix.
- End-to-end import -> readiness -> dashboard -> demand -> procurement -> decision -> PO -> receipt -> invoice -> margin.
