CREATE TABLE IF NOT EXISTS raw_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  import_type text NOT NULL,
  source_filename text,
  idempotency_key text,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'preview',
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  row_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, property_id, import_type, idempotency_key)
);

CREATE TABLE IF NOT EXISTS import_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_import_id uuid REFERENCES raw_imports(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  import_type text NOT NULL,
  canonical_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text,
  committed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, property_id, import_type, idempotency_key)
);

CREATE TABLE IF NOT EXISTS sales_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  external_id text,
  business_date date NOT NULL,
  service_period text,
  transaction_ts timestamptz,
  gross_sales numeric NOT NULL DEFAULT 0,
  net_sales numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, property_id, external_id)
);

CREATE TABLE IF NOT EXISTS sales_transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  sales_transaction_id uuid NOT NULL REFERENCES sales_transactions(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  quantity numeric NOT NULL,
  net_sales numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS demand_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN ('POS_SALES','RESERVATION','OCCUPANCY','BANQUET','EVENT','PROMOTION','WEATHER','HOLIDAY','MANUAL_OVERRIDE')),
  signal_date date NOT NULL,
  service_period text,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  canonical_ingredient_id uuid REFERENCES canonical_ingredients(id) ON DELETE SET NULL,
  quantity numeric,
  value numeric,
  confidence numeric,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, property_id, signal_type, signal_date, service_period, idempotency_key)
);

CREATE TABLE IF NOT EXISTS forecast_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  forecast_date date NOT NULL,
  horizon_days integer NOT NULL DEFAULT 7,
  algorithm text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS demand_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  forecast_run_id uuid NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
  forecast_date date NOT NULL,
  service_period text,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  canonical_ingredient_id uuid REFERENCES canonical_ingredients(id) ON DELETE SET NULL,
  forecast_quantity numeric NOT NULL,
  confidence numeric NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS demand_forecast_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  demand_forecast_id uuid NOT NULL REFERENCES demand_forecasts(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('menu_item','canonical_ingredient')),
  item_id uuid,
  item_name text NOT NULL,
  current_stock numeric,
  forecast_demand numeric NOT NULL,
  projected_stock numeric,
  required_quantity numeric,
  recommended_order_date date,
  confidence numeric NOT NULL,
  risk text NOT NULL DEFAULT 'normal',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forecast_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  forecast_run_id uuid REFERENCES forecast_runs(id) ON DELETE CASCADE,
  evaluation_date date NOT NULL,
  mae numeric,
  mape numeric,
  bias numeric,
  confidence_calibration numeric,
  sample_size integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_transactions_tenant_date ON sales_transactions(organization_id, property_id, business_date);
CREATE INDEX IF NOT EXISTS idx_demand_signals_tenant_date ON demand_signals(organization_id, property_id, signal_date);
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_tenant_date ON demand_forecasts(organization_id, property_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_demand_forecast_items_forecast ON demand_forecast_items(demand_forecast_id);

ALTER TABLE raw_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_forecast_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_evaluations ENABLE ROW LEVEL SECURITY;
