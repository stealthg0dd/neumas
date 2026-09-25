CREATE TABLE IF NOT EXISTS units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  dimension text NOT NULL DEFAULT 'count',
  to_base_factor numeric NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS uom_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_uom_id uuid NOT NULL REFERENCES units_of_measure(id) ON DELETE CASCADE,
  to_uom_id uuid NOT NULL REFERENCES units_of_measure(id) ON DELETE CASCADE,
  factor numeric NOT NULL,
  ingredient_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, from_uom_id, to_uom_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS canonical_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canonical_name text NOT NULL,
  category text,
  base_uom_id uuid REFERENCES units_of_measure(id) ON DELETE SET NULL,
  density_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, canonical_name)
);

ALTER TABLE uom_conversions
  DROP CONSTRAINT IF EXISTS uom_conversions_ingredient_id_fkey;
ALTER TABLE uom_conversions
  ADD CONSTRAINT uom_conversions_ingredient_id_fkey
  FOREIGN KEY (ingredient_id) REFERENCES canonical_ingredients(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS ingredient_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canonical_ingredient_id uuid NOT NULL REFERENCES canonical_ingredients(id) ON DELETE CASCADE,
  alias text NOT NULL,
  source text,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, alias)
);

CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  menu_price numeric,
  currency text NOT NULL DEFAULT 'USD',
  active_version_id uuid,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, property_id, name)
);

CREATE TABLE IF NOT EXISTS recipe_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  yield_quantity numeric NOT NULL DEFAULT 1,
  yield_uom_id uuid REFERENCES units_of_measure(id) ON DELETE SET NULL,
  serving_count numeric NOT NULL DEFAULT 1,
  portion_quantity numeric,
  portion_uom_id uuid REFERENCES units_of_measure(id) ON DELETE SET NULL,
  preparation_loss_pct numeric NOT NULL DEFAULT 0,
  waste_allowance_pct numeric NOT NULL DEFAULT 0,
  effective_from date,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, recipe_id, version_number)
);

ALTER TABLE recipes
  DROP CONSTRAINT IF EXISTS recipes_active_version_id_fkey;
ALTER TABLE recipes
  ADD CONSTRAINT recipes_active_version_id_fkey
  FOREIGN KEY (active_version_id) REFERENCES recipe_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipe_version_id uuid NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  canonical_ingredient_id uuid NOT NULL REFERENCES canonical_ingredients(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL,
  uom_id uuid REFERENCES units_of_measure(id) ON DELETE SET NULL,
  converted_base_quantity numeric,
  substitute_group text,
  preparation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  selling_price numeric,
  currency text NOT NULL DEFAULT 'USD',
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, property_id, name)
);

CREATE TABLE IF NOT EXISTS menu_item_recipe_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  recipe_version_id uuid NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  quantity_multiplier numeric NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, menu_item_id, recipe_version_id)
);

CREATE TABLE IF NOT EXISTS supplier_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  canonical_ingredient_id uuid NOT NULL REFERENCES canonical_ingredients(id) ON DELETE CASCADE,
  supplier_sku text,
  supplier_name text,
  pack_quantity numeric NOT NULL DEFAULT 1,
  pack_uom_id uuid REFERENCES units_of_measure(id) ON DELETE SET NULL,
  base_quantity numeric,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, property_id, vendor_id, supplier_sku)
);

CREATE TABLE IF NOT EXISTS supplier_item_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  supplier_item_id uuid NOT NULL REFERENCES supplier_items(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  effective_at timestamptz NOT NULL DEFAULT now(),
  source text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, supplier_item_id, effective_at),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_food_graph_ingredients_org ON canonical_ingredients(organization_id);
CREATE INDEX IF NOT EXISTS idx_food_graph_recipe_versions_recipe ON recipe_versions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_food_graph_recipe_ingredients_version ON recipe_ingredients(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_food_graph_supplier_prices_item ON supplier_item_prices(supplier_item_id, effective_at DESC);

ALTER TABLE units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE uom_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_recipe_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_item_prices ENABLE ROW LEVEL SECURITY;
