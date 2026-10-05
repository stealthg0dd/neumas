# Supabase Migration CI

Migrations are applied **only through GitHub Actions**. Do not run production
`supabase db push` / `db reset` from a laptop.

## Workflow

- File: `.github/workflows/supabase-migrate.yml`
- Triggers:
  - `push` to `main` when files under `neumas-backend/supabase/migrations/` change
  - `workflow_dispatch` only when the confirmation input is exactly `apply-production`
- Environment: `production`
- Commands used: `supabase link`, `supabase migration list`, `supabase db push --linked --include-all`
- Commands **never** used: `db reset`, `db dump` to mutate, force drops, or destructive repair

## Required GitHub secrets

| Secret | Purpose |
|--------|---------|
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token / CI token for CLI auth |
| `SUPABASE_PROJECT_REF` | Production project ref (e.g. `abcdefghijklmnop`) |
| `SUPABASE_DB_PASSWORD` | Database password for linked `db push` |

These names match the workflow. Do not invent alternate secret names.

## Fail-closed behavior

- Missing any of the three secrets → job fails before linking
- Manual dispatch without `apply-production` → job skipped
- `db push` failure → workflow fails; deploy should treat migrations as a gate
- Credentials are never echoed; only secret presence / ref length is logged

## Migration order (Phase 2 prerequisites)

Already committed (must be applied via this workflow before agent-commerce /
exchange RFQ features are fully live in production):

1. `202609270003_agent_commerce_service_identity.sql` — API scopes, service clients, credentials, delegations
2. `202609280001_exchange_rfq_negotiation.sql` — RFQs, invitations, offers, negotiation events

Follow-on supplier network migration:

3. `202609280002_supplier_network_portal.sql` — supplier account linkage, locations, service areas, delivery slots, availability, commercial terms, capabilities, catalog import staging (extends `vendors`, does not duplicate supplier identity)

All migrations use `IF NOT EXISTS` / idempotent policy patterns where practical.

## Local development

Local Mac development may use placeholder Supabase credentials. `/ready` reports
`metadata.supabase=intentionally_unconfigured` and does **not** claim production
readiness. Apply migrations against a **local or branch** Supabase project only;
never against production from a developer machine.
