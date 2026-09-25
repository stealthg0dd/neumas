CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','PENDING_APPROVAL','APPROVED','DISPATCH_QUEUED','SENT','ACKNOWLEDGED','PARTIALLY_CONFIRMED','CONFIRMED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED','FAILED')),
  currency text NOT NULL DEFAULT 'USD',
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  commercial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_delivery_date date,
  decision_id uuid REFERENCES decisions(id) ON DELETE SET NULL,
  approval_id uuid REFERENCES approvals(id) ON DELETE SET NULL,
  external_reference text,
  subtotal numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canonical_ingredient_id uuid REFERENCES canonical_ingredients(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  supplier_item_offer_id uuid REFERENCES supplier_item_offers(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity numeric NOT NULL,
  uom text NOT NULL DEFAULT 'unit',
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  commercial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_state text,
  next_state text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  status text NOT NULL,
  delivery_date date,
  external_reference text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_acknowledgement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acknowledgement_id uuid NOT NULL REFERENCES supplier_acknowledgements(id) ON DELETE CASCADE,
  purchase_order_item_id uuid REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL,
  acknowledged_quantity numeric,
  acknowledged_unit_price numeric,
  substitution_name text,
  delivery_date date,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  receipt_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'RECEIVED',
  received_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  canonical_ingredient_id uuid REFERENCES canonical_ingredients(id) ON DELETE SET NULL,
  received_quantity numeric NOT NULL,
  rejected_quantity numeric NOT NULL DEFAULT 0,
  uom text NOT NULL DEFAULT 'unit',
  lot_code text,
  expiry_date date,
  substitution_name text,
  condition text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id uuid REFERENCES goods_receipts(id) ON DELETE SET NULL,
  invoice_number text,
  invoice_date date,
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vendor_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  purchase_order_item_id uuid REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id uuid REFERENCES goods_receipts(id) ON DELETE SET NULL,
  supplier_invoice_id uuid REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('MATCHED','WITHIN_TOLERANCE','REVIEW','DISPUTE')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliation_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_case_id uuid NOT NULL REFERENCES reconciliation_cases(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  issue_type text NOT NULL,
  severity text NOT NULL DEFAULT 'review',
  message text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_state ON purchase_orders(organization_id, property_id, state);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_tenant_po ON goods_receipts(organization_id, property_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_tenant_po ON supplier_invoices(organization_id, property_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_cases_tenant ON reconciliation_cases(organization_id, property_id, created_at DESC);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_acknowledgement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_issues ENABLE ROW LEVEL SECURITY;
