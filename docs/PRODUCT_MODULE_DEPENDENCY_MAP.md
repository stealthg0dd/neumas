# Neumas Product And Module Dependency Map

_Last updated: 2026-08-12_

## Purpose

This document maps the Neumas product surfaces to the code modules that implement them and shows the critical dependency edges between web, backend, database, AI orchestration, deployment, and operational tooling.

## Product Summary

Neumas is a hospitality inventory intelligence platform. Its current codebase supports:

- inventory system-of-record workflows
- scan ingestion and human review
- document extraction and posting to inventory
- prediction and reorder planning
- vendor intelligence and spend analysis
- shopping list generation and procurement support
- alerts, analytics, and reports
- admin multi-tenant controls
- public marketing, content, and pilot-conversion flows

## Top-Level System Surfaces

```text
Public site and product marketing (Next.js)
  -> positioning, pilot intake, use cases, SEO pages, trust pages

Authenticated operator dashboard (Next.js)
  -> inventory, scans, shopping, vendors, reports, predictions, admin

Backend API (FastAPI)
  -> auth, inventory ledger, scan pipeline, document review, predictions, analytics

Supabase
  -> auth, Postgres data model, storage, tenancy boundaries, migrations

Celery + Redis
  -> async processing for scans, reports, alerts, evaluation jobs

Health sidecar
  -> backend monitoring and router-system heartbeat

Legacy Vite web app
  -> secondary/legacy UI surface, not the primary active product shell
```

## Top-Level Dependency Graph

```text
neumas-web
  -> Supabase auth/session helpers
  -> neumas-backend APIs
  -> PostHog analytics
  -> Sentry web telemetry

neumas-backend
  -> Supabase Postgres/Auth/Storage
  -> Redis
  -> Celery workers
  -> AI providers through orchestration/failover
  -> email/notification services
  -> Sentry backend telemetry

neumas-health-agent
  -> neumas-backend /health
  -> Agent OS heartbeat endpoint

docs/adr/*
  -> architecture constraints that should guide future changes

.github/workflows/*
  -> CI, Vercel web deploy, Railway API/worker deploy, security scans
```

## Primary Product Modules

### 1. Authentication and tenant access

Business purpose:
- multi-tenant access control for operators, admins, and property-scoped users
- Supabase-backed identity reconciled with backend JWT claims

Primary modules:
- `neumas-backend/app/api/routes/auth.py`
- `neumas-backend/app/services/auth_service.py`
- `neumas-backend/app/core/security.py`
- `neumas-web/src/lib/auth-session.ts`
- `neumas-web/src/lib/auth-bootstrap.ts`
- `neumas-web/src/utils/supabase/*`
- `docs/adr/002-auth-session-model.md`

Depends on:
- Supabase Auth
- org/property/role claims
- frontend session orchestration

Downstream consumers:
- every authenticated backend route
- dashboard/admin access control
- mobile/API contract alignment

### 2. Inventory system of record

Business purpose:
- maintain current stock state plus auditable movement history
- provide the operational core of the product

Primary modules:
- `neumas-backend/app/api/routes/inventory.py`
- `neumas-backend/app/services/inventory_service.py`
- `neumas-backend/app/services/inventory_ledger_service.py`
- `neumas-backend/app/db/repositories/inventory.py`
- `neumas-backend/app/db/repositories/inventory_movements.py`
- `neumas-backend/app/schemas/inventory.py`
- `docs/adr/003-inventory-ledger-model.md`
- `neumas-web/src/app/dashboard/inventory/page.tsx`

Depends on:
- canonical items
- property/org tenancy
- document approval and manual adjustments
- append-only movement model

Downstream consumers:
- analytics
- predictions
- reorder planning
- alerts
- reports

### 3. Scan ingestion and vision pipeline

Business purpose:
- convert photos/uploads into usable structured inventory evidence
- support scan status, approval, and application into the inventory system

Primary modules:
- `neumas-backend/app/api/routes/scans.py`
- `neumas-backend/app/services/scan_service.py`
- `neumas-backend/app/services/vision_agent.py`
- `neumas-backend/app/tasks/scan_tasks.py`
- `neumas-backend/app/db/repositories/scans.py`
- `neumas-web/src/app/api/scan/route.ts`
- `neumas-web/src/app/dashboard/scans/page.tsx`
- `neumas-web/src/lib/scan-progress.ts`
- `neumas-web/src/lib/scan-upload-contract.ts`

Depends on:
- storage upload flow
- AI vision path
- manual approval path
- Celery/async orchestration

Downstream consumers:
- inventory updates
- document review and audit context
- operator activity feed

### 4. Documents and review queue

Business purpose:
- ingest purchase/receipt/vendor documents
- expose human review and approve-to-ledger workflows

Primary modules:
- `neumas-backend/app/api/routes/documents.py`
- `neumas-backend/app/services/document_service.py`
- `neumas-backend/app/services/document_review_service.py`
- `neumas-backend/app/db/repositories/documents.py`
- `neumas-backend/app/db/repositories/document_line_items.py`
- `neumas-web/src/app/dashboard/documents/page.tsx`
- `neumas-web/src/components/documents/*`

Depends on:
- extracted line items
- canonical item resolution
- inventory ledger posting

Downstream consumers:
- stock receipts
- vendor analytics
- audit/compliance
- reports

### 5. Predictions, patterns, and reorder intelligence

Business purpose:
- forecast demand, detect stockout risk, and generate recommended reorder actions

Primary modules:
- `neumas-backend/app/api/routes/predictions.py`
- `neumas-backend/app/services/prediction_service.py`
- `neumas-backend/app/services/predict_agent.py`
- `neumas-backend/app/services/pattern_agent.py`
- `neumas-backend/app/services/reorder_service.py`
- `neumas-backend/app/services/restock_service.py`
- `neumas-web/src/app/dashboard/predictions/page.tsx`
- `neumas-web/src/app/dashboard/restock/page.tsx`
- `neumas-web/src/lib/prediction-display.ts`

Depends on:
- inventory ledger history
- scan/document truth inputs
- vendor/catalog context
- retrieval/context building

Downstream consumers:
- shopping list generation
- alerts
- executive briefing
- property-level planning

### 6. Shopping and procurement workflow

Business purpose:
- convert predicted need and operator intent into workable shopping lists
- support approval, optimization, and purchasing states

Primary modules:
- `neumas-backend/app/api/routes/shopping.py`
- `neumas-backend/app/services/shopping_service.py`
- `neumas-backend/app/services/shopping_agent.py`
- `neumas-backend/app/services/budget_agent.py`
- `neumas-backend/app/db/repositories/shopping_lists.py`
- `neumas-web/src/app/dashboard/shopping/page.tsx`
- `neumas-web/src/components/dashboard/ShoppingPreview.tsx`

Depends on:
- inventory state
- prediction outputs
- budget constraints
- vendor and price context

Downstream consumers:
- procurement actions
- spend optimization
- vendor comparison decisions

### 7. Vendors and price intelligence

Business purpose:
- manage vendor records, compare suppliers, and surface price intelligence

Primary modules:
- `neumas-backend/app/api/routes/vendors.py`
- `neumas-backend/app/api/routes/vendor_analytics.py`
- `neumas-backend/app/services/vendor_service.py`
- `neumas-backend/app/services/vendor_analytics_service.py`
- `neumas-backend/app/services/catalog_service.py`
- `neumas-backend/app/db/repositories/vendors.py`
- `neumas-backend/app/db/repositories/canonical_items.py`
- `neumas-web/src/app/dashboard/vendors/page.tsx`
- `neumas-web/src/components/vendors/*`

Depends on:
- canonical item normalization
- document and spend history
- vendor merge/normalization flows

Downstream consumers:
- reorder planning
- analytics
- executive briefing
- anomaly alerts

### 8. Alerts and analytics

Business purpose:
- surface actionable issues and summarize operational performance

Primary modules:
- `neumas-backend/app/api/routes/alerts.py`
- `neumas-backend/app/api/routes/analytics.py`
- `neumas-backend/app/services/alert_service.py`
- `neumas-backend/app/services/analytics_service.py`
- `neumas-backend/app/tasks/alert_tasks.py`
- `neumas-web/src/app/dashboard/alerts/page.tsx`
- `neumas-web/src/app/dashboard/analytics/page.tsx`
- `neumas-web/src/components/alerts/*`

Depends on:
- inventory, predictions, vendor, and usage data
- async alert evaluation

Downstream consumers:
- operator action prioritization
- admin oversight
- reporting surfaces

### 9. Reports and executive insight

Business purpose:
- convert platform state into digestible outputs for operators and leadership

Primary modules:
- `neumas-backend/app/api/routes/reports.py`
- `neumas-backend/app/api/routes/insights.py`
- `neumas-backend/app/services/report_service.py`
- `neumas-backend/app/services/executive_briefing_service.py`
- `neumas-backend/app/services/research_agent.py`
- `neumas-backend/app/tasks/report_tasks.py`
- `neumas-web/src/app/dashboard/reports/page.tsx`
- `neumas-web/src/components/reports/*`
- `docs/runbooks/report-generation.md`

Depends on:
- analytics summaries
- retrieval/context assembly
- AI routing/cost accounting

Downstream consumers:
- operator reporting
- executive summaries
- external/customer-facing exports

### 10. Admin control plane

Business purpose:
- allow org-wide oversight, system health review, usage metering, and governance actions

Primary modules:
- `neumas-backend/app/api/routes/admin.py`
- `neumas-backend/app/api/admin/*`
- `neumas-backend/app/services/admin_service.py`
- `neumas-backend/app/services/audit_service.py`
- `neumas-backend/app/services/usage_service.py`
- `neumas-backend/app/db/repositories/admin*.py`
- `neumas-backend/app/db/repositories/audit_logs.py`
- `neumas-backend/app/db/repositories/usage_metering.py`
- `neumas-web/src/app/dashboard/admin/page.tsx`
- `neumas-web/src/components/admin/*`

Depends on:
- all platform-wide usage data
- feature flags
- audit logging
- health/status signals

Downstream consumers:
- internal ops
- support workflows
- tenant governance

### 11. Public site and growth engine

Business purpose:
- explain the product, attract inbound interest, and convert pilot demand

Primary modules:
- `neumas-web/src/app/page.tsx`
- `neumas-web/src/components/landing/*`
- `neumas-web/src/app/pilot/page.tsx`
- `neumas-web/src/components/PilotIntake.tsx`
- `neumas-web/src/app/features/[slug]/page.tsx`
- `neumas-web/src/app/use-cases/[slug]/page.tsx`
- `neumas-web/src/app/insights/*`
- `neumas-web/src/app/security/page.tsx`
- `neumas-web/src/app/privacy/page.tsx`
- `neumas-web/src/app/terms/page.tsx`

Depends on:
- public content models
- analytics
- pilot intake API

Downstream consumers:
- top-of-funnel conversion
- search discoverability
- buyer education

### 12. AI orchestration and retrieval platform layer

Business purpose:
- centralize AI failover, cost accounting, retrieval, and context assembly

Primary modules:
- `neumas-backend/app/services/orchestration_service.py`
- `neumas-backend/app/services/llm_failover.py`
- `neumas-backend/app/services/retrieval_service.py`
- `neumas-backend/app/services/context_builder.py`
- `neumas-backend/app/services/copilot_tool_service.py`
- `docs/adr/004-ai-routing-and-cost-accounting.md`
- `docs/adr/005-retrieval-architecture.md`

Depends on:
- provider keys
- usage metering
- Postgres retrieval strategy

Downstream consumers:
- scan interpretation
- executive briefing
- shopping/prediction assistance
- future copilot surfaces

## Backend Domain Map

| Backend area | Main responsibility | Key dependencies |
|---|---|---|
| `app/api/routes/auth.py` | identity and claims | Supabase auth, JWT, org/property role data |
| `app/api/routes/inventory.py` | inventory CRUD and movements | inventory services, ledger repo |
| `app/api/routes/scans.py` | upload, process, approve scans | vision, tasks, storage |
| `app/api/routes/documents.py` | document review and posting | extraction, line-item repos, ledger |
| `app/api/routes/predictions.py` | forecasting and reorder intelligence | prediction services, history |
| `app/api/routes/shopping.py` | shopping list workflows | reorder, budget, vendor context |
| `app/api/routes/vendors.py` and `vendor_analytics.py` | vendor master data and price intel | catalog normalization, spend data |
| `app/api/routes/alerts.py` and `analytics.py` | monitoring and summary metrics | inventory/prediction/usage signals |
| `app/api/routes/reports.py` and `insights.py` | report generation and executive summaries | retrieval, AI routing, analytics |
| `app/api/routes/admin.py` and `app/api/admin/*` | internal control plane | audit, usage, org/property data |

## Frontend Route Group Map

| Frontend area | Product job |
|---|---|
| `src/app/page.tsx` + `src/components/landing/*` | public marketing homepage |
| `src/app/pilot/page.tsx` | pilot conversion and intake |
| `src/app/dashboard/*` | authenticated operating cockpit |
| `src/app/dashboard/inventory` | stock system of record |
| `src/app/dashboard/scans` | scan workflow |
| `src/app/dashboard/documents` | review queue and approvals |
| `src/app/dashboard/predictions` and `restock` | forecasting and planning |
| `src/app/dashboard/shopping` | procurement workflow |
| `src/app/dashboard/vendors` | vendor management |
| `src/app/dashboard/alerts`, `analytics`, `reports`, `admin` | oversight and intelligence |
| `src/app/insights/*`, `features/*`, `use-cases/*`, `glossary/*` | SEO/content acquisition layer |

## Infrastructure And Ops Dependencies

### CI/CD

- `.github/workflows/ci.yml`
  - web build, type-check, tests
  - backend lint, tests, smoke tests, mypy ratchet
- `.github/workflows/deploy-web.yml`
  - Vercel production deployment for `neumas-web`
- `.github/workflows/deploy-worker.yml`
  - Railway deployment for backend API + Celery worker
- `.github/workflows/security-scan.yml`
  - npm audit, Trivy, pip-audit

### Runtime packaging

- `nixpacks.toml`
  - monorepo-root backend build strategy
- `railway.toml`
  - root API deployment config
- `neumas-web/railway.toml`
  - web-specific deployment path if used
- `neumas-health-agent/railway.toml`
  - sidecar deployment

## Architectural Constraints That Matter

- `docs/adr/001-canonical-schema-strategy.md`
  - schema truth lives in the canonical Supabase schema + forward-only migrations
- `docs/adr/002-auth-session-model.md`
  - `src/lib/auth-session.ts` is the single frontend auth orchestrator
- `docs/adr/003-inventory-ledger-model.md`
  - quantity changes must be ledger-backed and idempotent
- `docs/adr/004-ai-routing-and-cost-accounting.md`
  - AI calls route through orchestration and record usage cost
- `docs/adr/005-retrieval-architecture.md`
  - retrieval is Postgres-first, vector search is future extensibility

## What Future Builders Should Extend

- Add backend features by changing all three layers together:
  - route
  - service
  - repository/schema/migration
- Treat `inventory_movements` and idempotency as non-optional for stock-changing logic.
- Route AI features through orchestration/retrieval services rather than embedding provider calls in endpoint handlers.
- Extend the main Next.js app in `neumas-web`; avoid expanding `neumas-web-vite` unless intentionally retiring or migrating it.
- Keep docs in sync with ADR constraints; they are part of the architecture, not optional commentary.
