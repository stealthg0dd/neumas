CREATE TABLE IF NOT EXISTS api_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO api_scopes (scope, description) VALUES
  ('catalog:read', 'Read supplier catalog and mapped product data'),
  ('supplier:read', 'Read supplier profiles and performance summaries'),
  ('availability:read', 'Read supplier availability and commercial availability fields'),
  ('rfq:create', 'Create RFQs when RFQ domain is enabled'),
  ('rfq:read', 'Read RFQs when RFQ domain is enabled'),
  ('offer:read', 'Read supplier offers and pricing'),
  ('order:create', 'Create order proposals when ordering is enabled'),
  ('order:read', 'Read order status when ordering is enabled'),
  ('webhook:manage', 'Manage webhook subscriptions when webhook delivery is enabled')
ON CONFLICT (scope) DO NOTHING;

CREATE TABLE IF NOT EXISTS service_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  allowed_scopes text[] NOT NULL DEFAULT '{}',
  allowed_property_ids uuid[] NOT NULL DEFAULT '{}',
  allowed_supplier_ids uuid[] NOT NULL DEFAULT '{}',
  allowed_categories text[] NOT NULL DEFAULT '{}',
  spend_limit numeric,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_client_id uuid NOT NULL REFERENCES service_clients(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  agent_type text NOT NULL DEFAULT 'buyer_agent',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_client_id uuid NOT NULL REFERENCES service_clients(id) ON DELETE CASCADE,
  credential_prefix text NOT NULL UNIQUE,
  credential_hash text NOT NULL,
  name text,
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_client_id uuid NOT NULL REFERENCES service_clients(id) ON DELETE CASCADE,
  agent_identity_id uuid REFERENCES agent_identities(id) ON DELETE CASCADE,
  scopes text[] NOT NULL DEFAULT '{}',
  property_ids uuid[] NOT NULL DEFAULT '{}',
  supplier_ids uuid[] NOT NULL DEFAULT '{}',
  categories text[] NOT NULL DEFAULT '{}',
  spend_limit numeric,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_clients_org ON service_clients(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_identities_client ON agent_identities(service_client_id);
CREATE INDEX IF NOT EXISTS idx_api_credentials_prefix ON api_credentials(credential_prefix);
CREATE INDEX IF NOT EXISTS idx_api_credentials_client ON api_credentials(service_client_id);
CREATE INDEX IF NOT EXISTS idx_delegations_client ON delegations(service_client_id);

ALTER TABLE api_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegations ENABLE ROW LEVEL SECURITY;
