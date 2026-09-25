# Autonomous Procurement Implementation

Branch: `feat/autonomous-procurement-platform`
Base commit: `705869bb4c2739b94fcfda5e78e99c42f3a23cc5`
Started: 2026-09-25

## Migration Path

Use `neumas-backend/supabase/migrations/` for all new migrations.

Decision: this is the currently active Supabase migration stream and contains the newest timestamped migration (`202609150001_marketing_cms.sql`). The older `neumas-backend/migrations/` stream has duplicate numbered files and will not be extended for this build. Historical migration cleanup is explicitly deferred.

Naming convention for new migrations: `YYYYMMDDNNNN_descriptive_name.sql`.

## Modules Completed

- Baseline branch and implementation tracker established.
- Wave 1 Control Center aggregation API added.
- Wave 1 authenticated F&B operator navigation updated to Control Center taxonomy while preserving legacy routes.
- Wave 1 Control Center dashboard added with KPI row, operating views, action/exception tables, evidence drawer, and honest empty/N/A states.
- Wave 1 shell routes added for Margin, Demand, Procurement, Invoices, Recipes, Waste, Exceptions, Agent Center, Decisions, and Integrations.
- Wave 2 Food Graph domain model, deterministic costing service, CSV import preview/commit API, and recipe UI added.

## Migrations Added

- None yet.
- `neumas-backend/supabase/migrations/202609250001_food_graph.sql`

## Endpoints Added

- `GET /api/control-center/summary`
- `GET /api/food-graph/recipes`
- `POST /api/food-graph/recipes`
- `GET /api/food-graph/recipes/{recipe_id}`
- `POST /api/food-graph/recipes/{recipe_id}/versions`
- `GET /api/food-graph/recipes/{recipe_id}/cost`
- `GET /api/food-graph/food-cost-drivers`
- `POST /api/food-graph/imports`

## UI Routes Added

- `/dashboard` upgraded to Control Center overview.
- `/dashboard/margin`
- `/dashboard/demand`
- `/dashboard/procurement`
- `/dashboard/procurement/recommendations`
- `/dashboard/procurement/purchase-orders`
- `/dashboard/procurement/deliveries`
- `/dashboard/procurement/suppliers`
- `/dashboard/procurement/price-intelligence`
- `/dashboard/invoices`
- `/dashboard/recipes`
- `/dashboard/recipes/[id]`
- `/dashboard/waste`
- `/dashboard/exceptions`
- `/dashboard/agent-center`
- `/dashboard/decisions`
- `/dashboard/integrations`

## Tests Added

- `neumas-backend/tests/test_control_center.py`
- `neumas-web/src/__tests__/control-center-dashboard.test.tsx`
- Updated `neumas-web/src/__tests__/navigation.test.ts`
- `neumas-backend/tests/test_food_graph.py`

## Remaining Blockers

- Production database/schema parity not verified and should not be inferred from local migrations.
- External supplier execution must remain non-fake until real adapters, credentials, contract tests, acknowledgement handling, and reconciliation records exist.
- Purchase orders, recipe/BOM costing, waste ledger, supplier OTIF, decision ledger, and external action gateway remain unavailable because durable backend entities/adapters do not exist yet.
