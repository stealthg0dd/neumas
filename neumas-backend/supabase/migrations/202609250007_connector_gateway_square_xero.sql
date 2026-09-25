ALTER TABLE integration_connections
  ADD COLUMN IF NOT EXISTS credential_reference text,
  ADD COLUMN IF NOT EXISTS oauth_state text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_subscriptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_successful_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS records_synced integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS raw_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_connection_id uuid REFERENCES integration_connections(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  provider_slug text NOT NULL,
  adapter_type text NOT NULL,
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapping_status text NOT NULL DEFAULT 'received',
  canonical_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_provider_events_dedupe
  ON raw_provider_events(integration_connection_id, external_event_id);

CREATE INDEX IF NOT EXISTS idx_raw_provider_events_tenant
  ON raw_provider_events(organization_id, property_id, received_at DESC);

ALTER TABLE raw_provider_events ENABLE ROW LEVEL SECURITY;
