-- Supplier network portal (Phase 2)
-- Extends vendors as the supplier identity. Does not create a parallel suppliers table.
-- Depends on: organizations, vendors, users, and prior agent-commerce / RFQ migrations.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS network_status text NOT NULL DEFAULT 'inactive';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS agent_endpoint_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS onboarding_step text NOT NULL DEFAULT 'profile';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS catalog_readiness_pct numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_network_status_check'
  ) THEN
    ALTER TABLE vendors
      ADD CONSTRAINT vendors_network_status_check
      CHECK (network_status IN ('inactive', 'onboarding', 'agent_ready', 'active', 'suspended'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_catalog_readiness_pct_check'
  ) THEN
    ALTER TABLE vendors
      ADD CONSTRAINT vendors_catalog_readiness_pct_check
      CHECK (catalog_readiness_pct >= 0 AND catalog_readiness_pct <= 100);
  END IF;
END $$;

COMMENT ON COLUMN vendors.network_status IS
  'Supplier network participation state; vendor row remains the canonical supplier identity.';

CREATE TABLE IF NOT EXISTS supplier_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  contact_email text,
  contact_phone text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'onboarding', 'agent_ready', 'active', 'suspended')),
  onboarding_step text NOT NULL DEFAULT 'profile'
    CHECK (onboarding_step IN (
      'profile', 'service_areas', 'catalog', 'pricing', 'availability',
      'moq_pack', 'delivery', 'commercial_terms', 'activate', 'complete'
    )),
  agent_endpoint_enabled boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS supplier_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name text NOT NULL,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text NOT NULL DEFAULT 'SG',
  latitude numeric,
  longitude numeric,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  location_id uuid REFERENCES supplier_locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  area_type text NOT NULL DEFAULT 'postal_code'
    CHECK (area_type IN ('postal_code', 'city', 'region', 'radius', 'custom')),
  area_value text NOT NULL,
  radius_km numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_delivery_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  service_area_id uuid REFERENCES supplier_service_areas(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  window_start time NOT NULL,
  window_end time NOT NULL,
  cutoff_hours integer NOT NULL DEFAULT 24,
  capacity integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end > window_start)
);

CREATE TABLE IF NOT EXISTS supplier_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  supplier_item_id uuid REFERENCES supplier_items(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'limited', 'unavailable', 'seasonal')),
  quantity_available numeric,
  available_from date,
  available_until date,
  lead_time_days integer NOT NULL DEFAULT 0,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_commercial_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'SGD',
  payment_terms text,
  minimum_order_value numeric,
  default_lead_time_days integer NOT NULL DEFAULT 1,
  delivery_fee numeric NOT NULL DEFAULT 0,
  free_delivery_threshold numeric,
  pack_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  moq_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  other_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  capability text NOT NULL
    CHECK (capability IN (
      'csv_import', 'manual_ui', 'rest_api', 'webhook',
      'cold_chain', 'same_day', 'scheduled_delivery', 'agent_endpoint'
    )),
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, capability)
);

-- Staging catalog rows before mapping onto supplier_items / canonical ingredients.
CREATE TABLE IF NOT EXISTS supplier_catalog_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  external_sku text,
  item_name text NOT NULL,
  unit text,
  pack_size text,
  unit_price numeric,
  currency text DEFAULT 'SGD',
  moq numeric,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_channel text NOT NULL DEFAULT 'csv'
    CHECK (import_channel IN ('csv', 'manual_ui', 'rest_api', 'webhook')),
  mapped_supplier_item_id uuid REFERENCES supplier_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_accounts_org
  ON supplier_accounts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_accounts_vendor
  ON supplier_accounts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_locations_vendor
  ON supplier_locations(organization_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_service_areas_vendor
  ON supplier_service_areas(organization_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_delivery_slots_vendor
  ON supplier_delivery_slots(organization_id, vendor_id, weekday);
CREATE INDEX IF NOT EXISTS idx_supplier_availability_vendor
  ON supplier_availability(organization_id, vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_commercial_terms_vendor
  ON supplier_commercial_terms(organization_id, vendor_id, is_active);
CREATE INDEX IF NOT EXISTS idx_supplier_capabilities_vendor
  ON supplier_capabilities(organization_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_catalog_imports_vendor
  ON supplier_catalog_imports(organization_id, vendor_id, created_at DESC);

ALTER TABLE supplier_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_delivery_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_commercial_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_catalog_imports ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'supplier_accounts',
    'supplier_locations',
    'supplier_service_areas',
    'supplier_delivery_slots',
    'supplier_availability',
    'supplier_commercial_terms',
    'supplier_capabilities',
    'supplier_catalog_imports'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_delete_admin ON %I', tbl);

    EXECUTE format(
      'CREATE POLICY service_role_all ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_select ON %I FOR SELECT TO authenticated USING (organization_id = public.org_id())',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_insert ON %I FOR INSERT TO authenticated WITH CHECK (organization_id = public.org_id())',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_update ON %I FOR UPDATE TO authenticated USING (organization_id = public.org_id()) WITH CHECK (organization_id = public.org_id())',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_delete_admin ON %I FOR DELETE TO authenticated USING (organization_id = public.org_id() AND public.is_org_admin())',
      tbl
    );
  END LOOP;
END $$;

INSERT INTO api_scopes (scope, description) VALUES
  ('supplier:manage', 'Manage supplier network profile, locations, and commercial terms'),
  ('supplier:catalog', 'Import and manage supplier catalog via CSV/API/webhook'),
  ('supplier:offer', 'Submit and negotiate supplier offers on RFQs')
ON CONFLICT (scope) DO NOTHING;
