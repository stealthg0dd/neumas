CREATE TABLE IF NOT EXISTS supplier_item_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  canonical_ingredient_id uuid NOT NULL REFERENCES canonical_ingredients(id) ON DELETE CASCADE,
  supplier_sku text,
  pack_quantity numeric NOT NULL DEFAULT 1,
  pack_uom_id uuid REFERENCES units_of_measure(id) ON DELETE SET NULL,
  normalized_base_quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  contract_price numeric,
  currency text NOT NULL DEFAULT 'USD',
  moq numeric NOT NULL DEFAULT 0,
  minimum_order_value numeric,
  delivery_fee numeric NOT NULL DEFAULT 0,
  free_delivery_threshold numeric,
  lead_time_days integer NOT NULL DEFAULT 0,
  order_cutoff time,
  delivery_weekdays integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  availability text NOT NULL DEFAULT 'available',
  valid_from date,
  valid_to date,
  preferred boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  fill_rate numeric,
  otif numeric,
  price_variance numeric,
  rejection_rate numeric,
  invoice_discrepancy_rate numeric,
  average_lead_time_days numeric,
  acknowledgement_time_hours numeric,
  sample_size integer NOT NULL DEFAULT 0,
  measured_from date,
  measured_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, property_id, vendor_id, measured_to)
);

CREATE TABLE IF NOT EXISTS procurement_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  canonical_ingredient_id uuid NOT NULL REFERENCES canonical_ingredients(id) ON DELETE CASCADE,
  required_quantity numeric NOT NULL,
  current_supplier_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  selected_allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_cost numeric NOT NULL DEFAULT 0,
  baseline_cost numeric,
  expected_savings numeric,
  tradeoffs jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  risk text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'recommended',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_item_offers_tenant_ingredient
  ON supplier_item_offers(organization_id, property_id, canonical_ingredient_id);
CREATE INDEX IF NOT EXISTS idx_supplier_performance_tenant_vendor
  ON supplier_performance_metrics(organization_id, property_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_procurement_recommendations_tenant
  ON procurement_recommendations(organization_id, property_id, created_at DESC);

ALTER TABLE supplier_item_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_recommendations ENABLE ROW LEVEL SECURITY;
