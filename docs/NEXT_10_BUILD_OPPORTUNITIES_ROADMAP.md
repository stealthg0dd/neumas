# Neumas Next 10 Build Opportunities

_Last updated: 2026-08-12_

This roadmap is based on the current Neumas repo shape and prioritizes work that expands the platform by deepening the existing operating spine rather than creating parallel systems.

## 1. Complete the scan-to-ledger golden path

Why this matters:
- scan ingestion, document review, and inventory ledger modules already exist
- the biggest product value is reliable end-to-end stock state from real-world evidence

Build next:
- unify scan approval, document approval, and movement posting into one observable flow
- add stronger retry-safe state transitions
- expose per-step confidence and failure reasons in the UI

Primary modules:
- `app/api/routes/scans.py`
- `app/api/routes/documents.py`
- `app/services/scan_service.py`
- `app/services/document_review_service.py`
- `app/services/inventory_ledger_service.py`

## 2. Ship a canonical item intelligence layer

Why this matters:
- inventory, vendors, documents, and predictions all depend on reliable item normalization
- this is the key multiplier for analytics quality and automation

Build next:
- improve canonical item aliasing and merge workflows
- add confidence scoring and conflict review for item normalization
- expose admin tooling for item taxonomy hygiene

Primary modules:
- `app/db/repositories/canonical_items.py`
- `app/services/catalog_service.py`
- `app/api/routes/vendors.py`
- `neumas-web/src/app/dashboard/admin/page.tsx`

## 3. Turn predictions into measurable planning loops

Why this matters:
- forecasting exists, but the product becomes much stronger when forecasts are evaluated against actual consumption outcomes

Build next:
- add forecast accuracy tracking
- compare predicted need vs actual movements
- surface per-property model confidence and drift

Primary modules:
- `app/services/prediction_service.py`
- `app/services/predict_agent.py`
- `app/tasks/evaluation_tasks.py`
- `app/api/routes/predictions.py`
- `neumas-web/src/app/dashboard/predictions/page.tsx`

## 4. Build a first-class reorder approval workflow

Why this matters:
- Neumas already generates reorder recommendations and shopping lists
- the next product step is durable operator approval, delegation, and completion

Build next:
- explicit reorder statuses
- assignee/owner fields
- approve/reject/partial-approve actions
- purchase completion feedback into the inventory ledger

Primary modules:
- `app/services/reorder_service.py`
- `app/services/shopping_service.py`
- `app/api/routes/shopping.py`
- `neumas-web/src/app/dashboard/restock/page.tsx`
- `neumas-web/src/app/dashboard/shopping/page.tsx`

## 5. Expand vendor intelligence into procurement optimization

Why this matters:
- vendor analytics are present but can become a stronger commercial differentiator

Build next:
- supplier scorecards across price, reliability, substitution risk, and lead time
- item-level preferred vendor recommendations
- anomaly detection for price spikes and vendor drift

Primary modules:
- `app/api/routes/vendor_analytics.py`
- `app/services/vendor_analytics_service.py`
- `app/services/vendor_service.py`
- `neumas-web/src/app/dashboard/vendors/page.tsx`

## 6. Add a unified operator copilot surface

Why this matters:
- orchestration, retrieval, and context-builder foundations already exist
- there is no single high-utility copilot experience tying them together yet

Build next:
- one operator query surface for stock, vendor, reorder, and anomaly questions
- grounded answers using retrieval-service methods only
- visible citations to documents, movements, and predictions

Primary modules:
- `app/services/retrieval_service.py`
- `app/services/context_builder.py`
- `app/services/copilot_tool_service.py`
- `app/services/orchestration_service.py`
- `neumas-web/src/components/dashboard/IntelligencePanel.tsx`

## 7. Harden multi-property and org-wide management UX

Why this matters:
- admin APIs and property-scoped claims already exist
- growth to larger hospitality groups depends on excellent multi-property operation

Build next:
- org-wide filters across dashboard surfaces
- property comparison views
- better role-aware navigation and permissions feedback

Primary modules:
- `app/api/routes/admin.py`
- `app/api/admin/*`
- `neumas-web/src/lib/store/auth.ts`
- `neumas-web/src/components/layout/Sidebar.tsx`
- `neumas-web/src/app/dashboard/admin/page.tsx`

## 8. Introduce a document and evidence audit timeline

Why this matters:
- hospitality operators and auditors need explainability for stock changes
- the ledger ADR already points in this direction

Build next:
- timeline view linking documents, scans, approvals, movements, and reports
- actor attribution and idempotency visibility
- exportable audit trails

Primary modules:
- `app/services/audit_service.py`
- `app/db/repositories/audit_logs.py`
- `app/db/repositories/documents.py`
- `app/db/repositories/inventory_movements.py`
- `neumas-web/src/app/dashboard/documents/page.tsx`

## 9. Standardize analytics taxonomy and usage metering

Why this matters:
- PostHog, admin usage endpoints, and AI cost accounting exist, but product growth will make event drift expensive

Build next:
- canonical event names across web and backend
- consistent org/property/object ids on events
- usage dashboards for scans, AI calls, reports, and approval actions

Primary modules:
- `neumas-web/src/lib/analytics.ts`
- `app/services/analytics_service.py`
- `app/services/usage_service.py`
- `app/api/routes/analytics.py`
- `app/api/routes/admin.py`

## 10. Consolidate the builder kit and de-risk surface drift

Why this matters:
- the primary Next.js app, legacy Vite app, ADRs, and API contracts all coexist
- future builders need a sharper “where to extend” map

Build next:
- document active vs legacy surfaces clearly
- add capability inventories and schema/entity maps
- decide whether `neumas-web-vite` is sunset, migration target, or maintained sidecar

Primary modules:
- `docs/adr/*`
- `docs/api/*`
- `neumas-web`
- `neumas-web-vite`

## Suggested Priority Order

1. Complete scan-to-ledger golden path
2. Canonical item intelligence layer
3. Predictions evaluation loop
4. Reorder approval workflow
5. Unified operator copilot
6. Vendor optimization
7. Multi-property management UX
8. Evidence audit timeline
9. Analytics taxonomy and usage metering
10. Builder kit / surface consolidation

## Guiding Principle

The strongest Neumas expansion path is:

`evidence capture -> canonicalize -> update ledger -> forecast -> recommend -> approve -> purchase -> explain`

The codebase already contains most of these pieces. The highest-value work is tightening the seams between them, making them measurable, and exposing them in operator-friendly workflows.
