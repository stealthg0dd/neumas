-- =============================================================================
-- BLOCK 4 of 5: Operational Tables + Triggers
-- Requires blocks 1-3. Creates: alerts, audit_logs, usage_events, reports,
--   feature_flags, research_posts
-- =============================================================================

-- ---------------------------------------------------------------------------
-- alerts
-- State: open -> acknowledged -> resolved | dismissed
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alerts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id        uuid        REFERENCES properties(id) ON DELETE CASCADE,
  item_id            uuid        REFERENCES inventory_items(id) ON DELETE SET NULL,
  alert_type         text        NOT NULL,
  severity           text        NOT NULL,
  state              text        NOT NULL DEFAULT 'open',
  title              text        NOT NULL,
  body               text        NOT NULL,
  metadata           jsonb       NOT NULL DEFAULT '{}',
  acknowledged_by_id uuid        REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at    timestamptz,
  resolved_by_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  resolved_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_org      ON alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_alerts_property ON alerts(property_id);
CREATE INDEX IF NOT EXISTS idx_alerts_state    ON alerts(organization_id, state);
CREATE INDEX IF NOT EXISTS idx_alerts_type     ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_item     ON alerts(item_id) WHERE item_id IS NOT NULL;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_alerts_updated_at
  BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- audit_logs
-- IMMUTABLE APPEND-ONLY. actor_id is NOT a FK (allows service-account entries).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id     uuid        REFERENCES properties(id) ON DELETE SET NULL,
  actor_id        uuid,
  actor_role      text,
  action          text        NOT NULL,
  resource_type   text        NOT NULL,
  resource_id     text,
  before_state    jsonb,
  after_state     jsonb,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS
  'Append-only. No UPDATE/DELETE policies for non-service-role. actor_id is not a FK.';
COMMENT ON COLUMN audit_logs.before_state IS
  'NULL for CREATE. Populated for UPDATE/DELETE to enable point-in-time reconstruction.';

CREATE INDEX IF NOT EXISTS idx_audit_org      ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor    ON audit_logs(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_action   ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- usage_events  (append-only; service-role writes; admin reads)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage_events (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id     uuid          REFERENCES properties(id) ON DELETE SET NULL,
  user_id         uuid          REFERENCES users(id) ON DELETE SET NULL,
  feature         text          NOT NULL,
  event_type      text          NOT NULL,
  model           text,
  input_tokens    integer       NOT NULL DEFAULT 0,
  output_tokens   integer       NOT NULL DEFAULT 0,
  cost_usd        numeric(12,8) NOT NULL DEFAULT 0,
  reference_id    text,
  reference_type  text,
  metadata        jsonb         NOT NULL DEFAULT '{}',
  created_at      timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE usage_events IS 'Append-only cost telemetry. Written by service-role only.';

CREATE INDEX IF NOT EXISTS idx_usage_org     ON usage_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_feature ON usage_events(organization_id, feature);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_user    ON usage_events(user_id) WHERE user_id IS NOT NULL;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- reports  (async generation jobs)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id        uuid        REFERENCES properties(id) ON DELETE CASCADE,
  requested_by_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
  report_type        text        NOT NULL,
  status             text        NOT NULL DEFAULT 'queued',
  params             jsonb       NOT NULL DEFAULT '{}',
  params_hash        text,
  result             jsonb,
  download_url       text,
  error_message      text,
  processing_time_ms integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN reports.params_hash IS
  'SHA-256(canonical params JSON). ReportsRepository.find_existing() avoids redundant generation.';

CREATE INDEX IF NOT EXISTS idx_reports_org      ON reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_hash     ON reports(organization_id, params_hash) WHERE params_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_property ON reports(property_id);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- email_logs  (transactional delivery + webhook events)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS email_logs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id        uuid        REFERENCES properties(id) ON DELETE CASCADE,
  user_id            uuid        REFERENCES users(id) ON DELETE SET NULL,
  email              text        NOT NULL,
  template_name      text        NOT NULL,
  subject            text        NOT NULL,
  provider           text        NOT NULL DEFAULT 'sendgrid',
  provider_message_id text,
  delivery_status    text        NOT NULL DEFAULT 'queued',
  error_message      text,
  metadata           jsonb       NOT NULL DEFAULT '{}',
  sent_at            timestamptz,
  delivered_at       timestamptz,
  opened_at          timestamptz,
  clicked_at         timestamptz,
  bounced_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_org         ON email_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_property    ON email_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_user        ON email_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_logs_email       ON email_logs(email);
CREATE INDEX IF NOT EXISTS idx_email_logs_template    ON email_logs(template_name);
CREATE INDEX IF NOT EXISTS idx_email_logs_status      ON email_logs(delivery_status);
CREATE INDEX IF NOT EXISTS idx_email_logs_provider_id ON email_logs(provider_message_id) WHERE provider_message_id IS NOT NULL;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_email_logs_updated_at
  BEFORE UPDATE ON email_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- feature_flags
-- NULL organization_id = global default. Org rows override global.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS feature_flags (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  organization_id uuid        REFERENCES organizations(id) ON DELETE CASCADE,
  enabled         boolean     NOT NULL DEFAULT false,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, organization_id)
);

-- Rename guard: handles DBs where column was originally named org_id.
-- RENAME is a no-op if org_id doesn't exist. ADD COLUMN is a no-op if column exists.
DO $$ BEGIN
  ALTER TABLE feature_flags RENAME COLUMN org_id TO organization_id;
EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

COMMENT ON COLUMN feature_flags.organization_id IS
  'NULL = global default. Org rows override. Query: .or("organization_id.eq.{org},organization_id.is.null").';

CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags(name);
CREATE INDEX IF NOT EXISTS idx_feature_flags_org  ON feature_flags(organization_id) WHERE organization_id IS NOT NULL;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- research_posts  (public content)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS research_posts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text        NOT NULL UNIQUE,
  title      text        NOT NULL,
  summary    text        NOT NULL,
  content    text        NOT NULL,
  category   text        NOT NULL DEFAULT 'general',
  tags       text[]      NOT NULL DEFAULT '{}',
  published  boolean     NOT NULL DEFAULT true,
  view_count integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_posts_slug     ON research_posts(slug);
CREATE INDEX IF NOT EXISTS idx_research_posts_category ON research_posts(category);
ALTER TABLE research_posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TRIGGER trg_research_posts_updated_at
  BEFORE UPDATE ON research_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
