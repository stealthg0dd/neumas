CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  adapter_type text NOT NULL,
  provider_slug text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'not_connected',
  health_status text NOT NULL DEFAULT 'unknown',
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  connection_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  last_checked_at timestamptz,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_connections_org_provider
  ON integration_connections(organization_id, provider_slug, adapter_type);

CREATE TABLE IF NOT EXISTS integration_event_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  external_event_id text NOT NULL,
  idempotency_key text NOT NULL,
  event_type text NOT NULL,
  adapter_type text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_event_receipts_unique
  ON integration_event_receipts(integration_connection_id, external_event_id);
