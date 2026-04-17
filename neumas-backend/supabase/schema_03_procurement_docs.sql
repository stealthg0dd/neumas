-- =============================================================================
-- BLOCK 3 of 5: Procurement / Document model
-- Requires blocks 1+2. Creates: scans, vendors, vendor_aliases,
--   canonical_items, item_aliases, documents, document_line_items,
--   consumption_patterns, predictions, shopping_lists, shopping_list_items
-- =============================================================================

-- ---------------------------------------------------------------------------
-- scans
-- Raw upload events before document extraction.
-- organization_id denormalized for org-level aggregate queries.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scans (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status             text        NOT NULL DEFAULT 'pending',
  scan_type          text        NOT NULL DEFAULT 'receipt',
  image_urls         jsonb       NOT NULL DEFAULT '[]',
  raw_results        jsonb       NOT NULL DEFAULT '{}',
  processed_results  jsonb       NOT NULL DEFAULT '{}',
  items_detected     integer     NOT NULL DEFAULT 0,
  confidence_score   numeric(5,4),
  processing_time_ms integer,
  error_message      text,
  started_at         timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ADD COLUMN guard: must come BEFORE COMMENT ON COLUMN and indexes.
ALTER TABLE scans ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- Back-fill organization_id from parent property (idempotent)
UPDATE scans s
   SET organization_id = p.organization_id
  FROM properties p
 WHERE s.property_id = p.id
   AND s.organization_id IS NULL;

COMMENT ON COLUMN scans.organization_id IS
  'Denormalized from properties.organization_id. Used by usage_service.get_org_summary().';

CREATE INDEX IF NOT EXISTS idx_scans_property ON scans(property_id);
CREATE INDEX IF NOT EXISTS idx_scans_org      ON scans(organization_id);
CREATE INDEX IF NOT EXISTS idx_scans_user     ON scans(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_status   ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_created  ON scans(created_at DESC);
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- vendors
-- Known suppliers. normalized_name for case-insensitive deduplication.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  normalized_name text,
  contact_email   text,
  contact_phone   text,
  address         text,
  website         text,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_vendors_org  ON vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(organization_id, name);
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- vendor_aliases
-- Maps raw OCR vendor strings to canonical vendors.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendor_aliases (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       uuid        NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alias_name      text        NOT NULL,
  source          text        NOT NULL DEFAULT 'manual',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, alias_name)
);

COMMENT ON TABLE vendor_aliases IS
  'Maps raw OCR vendor strings to canonical vendors. Upserted on (organization_id, alias_name).';

CREATE INDEX IF NOT EXISTS idx_vendor_aliases_vendor ON vendor_aliases(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_org    ON vendor_aliases(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_name   ON vendor_aliases(organization_id, alias_name);
ALTER TABLE vendor_aliases ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- canonical_items
-- Master item dictionary. canonical_name_tsv for full-text search.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS canonical_items (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canonical_name     text        NOT NULL,
  category           text,
  default_unit       text        NOT NULL DEFAULT 'unit',
  description        text,
  metadata           jsonb       NOT NULL DEFAULT '{}',
  canonical_name_tsv tsvector    GENERATED ALWAYS AS (to_tsvector('english', canonical_name)) STORED,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, canonical_name)
);

COMMENT ON COLUMN canonical_items.canonical_name_tsv IS
  'Auto-generated. Queried via .text_search("canonical_name_tsv", q) in CanonicalItemsRepository.';

CREATE INDEX IF NOT EXISTS idx_canonical_items_org  ON canonical_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_canonical_items_tsv  ON canonical_items USING gin(canonical_name_tsv);
CREATE INDEX IF NOT EXISTS idx_canonical_items_name ON canonical_items(organization_id, canonical_name);
ALTER TABLE canonical_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_canonical_items_updated_at
  BEFORE UPDATE ON canonical_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- item_aliases
-- Maps raw OCR item strings to canonical_items.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS item_aliases (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_item_id uuid          NOT NULL REFERENCES canonical_items(id) ON DELETE CASCADE,
  organization_id   uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alias_name        text          NOT NULL,
  source            text          NOT NULL DEFAULT 'manual',
  confidence        numeric(5,4)  NOT NULL DEFAULT 1.0,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (organization_id, alias_name)
);

CREATE INDEX IF NOT EXISTS idx_item_aliases_canonical ON item_aliases(canonical_item_id);
CREATE INDEX IF NOT EXISTS idx_item_aliases_org       ON item_aliases(organization_id);
CREATE INDEX IF NOT EXISTS idx_item_aliases_name      ON item_aliases(organization_id, alias_name);
ALTER TABLE item_aliases ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- documents
-- Normalized document records extracted from scans.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid          REFERENCES properties(id) ON DELETE CASCADE,
  organization_id    uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_id            uuid          REFERENCES scans(id) ON DELETE SET NULL,
  document_type      text          NOT NULL DEFAULT 'receipt',
  status             text          NOT NULL DEFAULT 'pending',
  raw_extraction     jsonb         NOT NULL DEFAULT '{}',
  normalized_data    jsonb         NOT NULL DEFAULT '{}',
  raw_vendor_name    text,
  vendor_id          uuid,
  total_amount       numeric(12,4),
  currency           text          DEFAULT 'USD',
  document_date      date,
  overall_confidence numeric(5,4),
  review_needed      boolean       NOT NULL DEFAULT false,
  review_reason      text,
  reviewed_by_id     uuid          REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,
  created_by_id      uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON COLUMN documents.raw_extraction IS
  'Verbatim JSON from vision/LLM pipeline. Treat as immutable once written.';
COMMENT ON COLUMN documents.vendor_id IS
  'Set by VendorsRepository.find_by_alias(). NULL until vendor matching step runs.';

DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT fk_documents_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_documents_org      ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_property ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_documents_scan     ON documents(scan_id);
CREATE INDEX IF NOT EXISTS idx_documents_status   ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_vendor   ON documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_documents_created  ON documents(created_at DESC);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- document_line_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS document_line_items (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid          NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  property_id         uuid          REFERENCES properties(id) ON DELETE CASCADE,
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  raw_name            text          NOT NULL,
  raw_quantity        numeric(12,3),
  raw_unit            text,
  raw_price           numeric(12,4),
  raw_total           numeric(12,4),
  normalized_name     text,
  normalized_quantity numeric(12,3),
  normalized_unit     text,
  unit_price          numeric(12,4),
  canonical_item_id   uuid          REFERENCES canonical_items(id) ON DELETE SET NULL,
  vendor_id           uuid          REFERENCES vendors(id) ON DELETE SET NULL,
  confidence          numeric(5,4),
  review_needed       boolean       NOT NULL DEFAULT false,
  review_reason       text,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE document_line_items IS
  'raw_* fields immutable post-creation. normalized_* set once by matching pipeline.';

CREATE INDEX IF NOT EXISTS idx_dli_document  ON document_line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_dli_org       ON document_line_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_dli_property  ON document_line_items(property_id);
CREATE INDEX IF NOT EXISTS idx_dli_canonical ON document_line_items(canonical_item_id);
CREATE INDEX IF NOT EXISTS idx_dli_vendor    ON document_line_items(vendor_id);
ALTER TABLE document_line_items ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- consumption_patterns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS consumption_patterns (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid          NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  property_id     uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pattern_type    text          NOT NULL,
  pattern_data    jsonb         NOT NULL,
  confidence      numeric(5,4)  NOT NULL DEFAULT 0,
  sample_size     integer       NOT NULL DEFAULT 0,
  valid_from      timestamptz,
  valid_until     timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (item_id, pattern_type)
);

CREATE INDEX IF NOT EXISTS idx_patterns_item     ON consumption_patterns(item_id);
CREATE INDEX IF NOT EXISTS idx_patterns_property ON consumption_patterns(property_id);
CREATE INDEX IF NOT EXISTS idx_patterns_org      ON consumption_patterns(organization_id);
ALTER TABLE consumption_patterns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_consumption_patterns_updated_at
  BEFORE UPDATE ON consumption_patterns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- predictions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS predictions (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id              uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id          uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id                  uuid          REFERENCES inventory_items(id) ON DELETE SET NULL,
  prediction_type          text          NOT NULL,
  prediction_date          timestamptz   NOT NULL,
  predicted_value          numeric(12,3) NOT NULL,
  confidence_interval_low  numeric(12,3),
  confidence_interval_high numeric(12,3),
  confidence               numeric(5,4)  NOT NULL DEFAULT 0,
  model_version            text,
  features_used            jsonb         NOT NULL DEFAULT '{}',
  actual_value             numeric(12,3),
  accuracy_score           numeric(5,4),
  days_until_stockout      integer,
  stockout_probability     numeric(5,4),
  stockout_risk_level      text,
  expires_at               timestamptz,
  created_at               timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON COLUMN predictions.actual_value IS
  'Retroactively set when actual consumption is observed. Used for accuracy_score and model retraining.';

CREATE INDEX IF NOT EXISTS idx_predictions_property ON predictions(property_id);
CREATE INDEX IF NOT EXISTS idx_predictions_org      ON predictions(organization_id);
CREATE INDEX IF NOT EXISTS idx_predictions_item     ON predictions(item_id);
CREATE INDEX IF NOT EXISTS idx_predictions_date     ON predictions(prediction_date);
CREATE INDEX IF NOT EXISTS idx_predictions_type     ON predictions(prediction_type);
CREATE INDEX IF NOT EXISTS idx_predictions_risk     ON predictions(stockout_risk_level) WHERE stockout_risk_level IS NOT NULL;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- shopping_lists
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shopping_lists (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id      uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id        uuid          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name                 text          NOT NULL,
  status               text          NOT NULL DEFAULT 'draft',
  total_estimated_cost numeric(12,4),
  total_actual_cost    numeric(12,4),
  budget_limit         numeric(12,4),
  currency             text          NOT NULL DEFAULT 'USD',
  notes                text,
  generation_params    jsonb         NOT NULL DEFAULT '{}',
  approved_at          timestamptz,
  approved_by_id       uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_property ON shopping_lists(property_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_org      ON shopping_lists(organization_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_status   ON shopping_lists(organization_id, status);
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_shopping_lists_updated_at
  BEFORE UPDATE ON shopping_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- shopping_list_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id  uuid          NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  inventory_item_id uuid          REFERENCES inventory_items(id) ON DELETE SET NULL,
  prediction_id     uuid          REFERENCES predictions(id) ON DELETE SET NULL,
  name              text          NOT NULL,
  quantity          numeric(12,3) NOT NULL,
  unit              text          NOT NULL DEFAULT 'unit',
  estimated_price   numeric(12,4),
  actual_price      numeric(12,4),
  currency          text          NOT NULL DEFAULT 'USD',
  priority          text          NOT NULL DEFAULT 'normal',
  reason            text,
  source            text          DEFAULT 'manual',
  is_purchased      boolean       NOT NULL DEFAULT false,
  purchased_at      timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sli_list ON shopping_list_items(shopping_list_id);
CREATE INDEX IF NOT EXISTS idx_sli_item ON shopping_list_items(inventory_item_id);
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;
