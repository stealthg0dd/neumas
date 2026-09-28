CREATE TABLE IF NOT EXISTS rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','OPEN','QUOTING','NEGOTIATING','SELECTED','CANCELLED','EXPIRED','CLOSED')),
  currency text NOT NULL DEFAULT 'USD',
  required_by date,
  response_deadline timestamptz,
  notes text,
  idempotency_key text,
  created_by_service_client_id uuid REFERENCES service_clients(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS rfq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canonical_ingredient_id uuid NOT NULL REFERENCES canonical_ingredients(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  uom_id uuid REFERENCES units_of_measure(id) ON DELETE SET NULL,
  normalized_base_quantity numeric NOT NULL CHECK (normalized_base_quantity > 0),
  specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','VIEWED','RESPONDED','DECLINED','EXPIRED')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (rfq_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS rfq_offer_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','COUNTERED','ACCEPTED','REJECTED','EXPIRED','WITHDRAWN')),
  current_version integer NOT NULL DEFAULT 1,
  idempotency_key text,
  submitted_by_service_client_id uuid REFERENCES service_clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, vendor_id),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS rfq_offer_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_response_id uuid NOT NULL REFERENCES rfq_offer_responses(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status text NOT NULL CHECK (status IN ('SUBMITTED','COUNTERED','ACCEPTED','REJECTED','EXPIRED','WITHDRAWN')),
  currency text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  landed_total numeric NOT NULL DEFAULT 0,
  minimum_order_value numeric,
  payment_terms text,
  delivery_date date,
  lead_time_days integer NOT NULL DEFAULT 0,
  availability text NOT NULL DEFAULT 'available',
  valid_until timestamptz,
  substitutions jsonb NOT NULL DEFAULT '[]'::jsonb,
  other_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_type text NOT NULL CHECK (created_by_type IN ('BUYER','SUPPLIER','SYSTEM')),
  created_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_response_id, version_number)
);

CREATE TABLE IF NOT EXISTS negotiation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  offer_response_id uuid NOT NULL REFERENCES rfq_offer_responses(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('PRICE_CHANGE','QUANTITY_CHANGE','DELIVERY_CHANGE','SUBSTITUTION','PAYMENT_TERM_CHANGE','OTHER_TERM_CHANGE')),
  from_version integer,
  to_version integer NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_type text NOT NULL CHECK (actor_type IN ('BUYER','SUPPLIER','SYSTEM')),
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commercial_term_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  offer_response_id uuid NOT NULL REFERENCES rfq_offer_responses(id) ON DELETE CASCADE,
  offer_version_id uuid NOT NULL REFERENCES rfq_offer_versions(id) ON DELETE RESTRICT,
  terms jsonb NOT NULL,
  terms_hash text NOT NULL,
  selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rfqs_tenant_status ON rfqs(organization_id, property_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq ON rfq_items(rfq_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invitations_rfq ON supplier_invitations(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_offers_rfq ON rfq_offer_responses(rfq_id, status);
CREATE INDEX IF NOT EXISTS idx_offer_versions_offer ON rfq_offer_versions(offer_response_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_negotiation_events_rfq ON negotiation_events(rfq_id, created_at);

ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_offer_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_offer_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_term_snapshots ENABLE ROW LEVEL SECURITY;
