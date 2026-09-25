CREATE TABLE IF NOT EXISTS margin_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  scope_type text NOT NULL,
  scope_id uuid,
  snapshot_date date NOT NULL DEFAULT current_date,
  theoretical_food_cost numeric,
  forecast_food_cost numeric,
  purchased_cost numeric,
  received_cost numeric,
  invoiced_cost numeric,
  actual_consumption_cost numeric,
  waste_cost numeric,
  supplier_variance numeric,
  invoice_variance numeric,
  food_cost_pct numeric,
  realized_food_cost numeric,
  margin_leakage numeric,
  drivers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS margin_attribution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES margin_snapshots(id) ON DELETE CASCADE,
  leakage_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waste_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  waste_type text NOT NULL CHECK (waste_type IN ('spoilage','prep','overproduction','damage','expiry','quality_rejection','unknown')),
  canonical_ingredient_id uuid REFERENCES canonical_ingredients(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  quantity numeric NOT NULL,
  uom text NOT NULL DEFAULT 'unit',
  cost numeric,
  reason text,
  source text,
  event_date date NOT NULL DEFAULT current_date,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outcome_learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  decision_id uuid REFERENCES decisions(id) ON DELETE SET NULL,
  action_id uuid REFERENCES actions(id) ON DELETE SET NULL,
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb NOT NULL DEFAULT '{}'::jsonb,
  variance jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_policy_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_margin_snapshots_scope ON margin_snapshots(organization_id, property_id, scope_type, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_waste_events_tenant_date ON waste_events(organization_id, property_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_outcome_learning_tenant ON outcome_learning_events(organization_id, property_id, created_at DESC);

ALTER TABLE margin_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_attribution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_learning_events ENABLE ROW LEVEL SECURITY;
