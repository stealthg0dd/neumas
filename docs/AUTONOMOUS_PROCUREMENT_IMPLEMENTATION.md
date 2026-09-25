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
- Wave 3 canonical demand model, universal CSV import layer, deterministic demand forecasting service, evaluation helpers, and demand UI added.
- Wave 4 supplier commercial terms, supplier performance metrics, deterministic procurement optimizer, price intelligence, and procurement UI added.
- Wave 5 durable policy, decision, approval, action, attempt, verification, outcome architecture plus internal action gateway and Agent Center/Decision Ledger UI added.

## Migrations Added

- None yet.
- `neumas-backend/supabase/migrations/202609250001_food_graph.sql`
- `neumas-backend/supabase/migrations/202609250002_demand_intelligence.sql`
- `neumas-backend/supabase/migrations/202609250003_supplier_intelligence_procurement.sql`
- `neumas-backend/supabase/migrations/202609250004_autonomy_decision_action.sql`

## Endpoints Added

- `GET /api/control-center/summary`
- `GET /api/food-graph/recipes`
- `POST /api/food-graph/recipes`
- `GET /api/food-graph/recipes/{recipe_id}`
- `POST /api/food-graph/recipes/{recipe_id}/versions`
- `GET /api/food-graph/recipes/{recipe_id}/cost`
- `GET /api/food-graph/food-cost-drivers`
- `POST /api/food-graph/imports`
- `POST /api/demand/imports`
- `POST /api/demand/forecasts`
- `GET /api/demand/summary`
- `GET /api/procurement/summary`
- `GET /api/autonomy/agents/summary`
- `GET /api/autonomy/decisions`
- `POST /api/autonomy/decisions`
- `POST /api/autonomy/actions`
- `POST /api/autonomy/actions/{action_id}/retry`

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
- `neumas-backend/tests/test_demand.py`
- `neumas-backend/tests/test_procurement_optimizer.py`
- `neumas-backend/tests/test_autonomy.py`

## Remaining Blockers

- Production database/schema parity not verified and should not be inferred from local migrations.
- External supplier execution must remain non-fake until real adapters, credentials, contract tests, acknowledgement handling, and reconciliation records exist.
- Purchase order entities, waste ledger, verified supplier OTIF outcomes, and external action providers remain unavailable because real provider contracts/outcome records do not exist yet.
- External action providers remain intentionally unimplemented; the Wave 5 gateway only supports internal/manual provider abstractions until real provider contracts exist.
