CREATE TABLE IF NOT EXISTS cms_homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  eyebrow text,
  headline text,
  body text,
  enabled boolean NOT NULL DEFAULT true,
  approved_for_public boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('image', 'video', 'document', 'logo')),
  storage_path text,
  url text,
  alt_text text,
  caption text,
  approved_for_public boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_path IS NOT NULL OR url IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS cms_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('customer', 'pilot', 'partner', 'integration', 'program')),
  logo_asset_id uuid REFERENCES cms_media_assets(id) ON DELETE SET NULL,
  website_url text,
  approved_for_public boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  value text NOT NULL,
  qualifier text NOT NULL,
  evidence_note text NOT NULL,
  approved_for_public boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text NOT NULL,
  short_bio text NOT NULL,
  headshot_asset_id uuid REFERENCES cms_media_assets(id) ON DELETE SET NULL,
  linkedin_url text,
  approved_for_public boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  video_url text NOT NULL,
  poster_asset_id uuid REFERENCES cms_media_assets(id) ON DELETE SET NULL,
  placement text NOT NULL CHECK (placement IN ('hero', 'demo_primary', 'demo_deep', 'resource')),
  approved_for_public boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_case_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text NOT NULL,
  category text,
  url text,
  approved_for_public boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote text NOT NULL,
  attribution text NOT NULL,
  role text,
  approved_for_public boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text NOT NULL,
  resource_type text NOT NULL DEFAULT 'article',
  url text NOT NULL,
  approved_for_public boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'integration',
  description text,
  logo_asset_id uuid REFERENCES cms_media_assets(id) ON DELETE SET NULL,
  approved_for_public boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cms_homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_case_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_integrations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON cms_homepage_sections TO anon, authenticated;
GRANT SELECT ON cms_media_assets TO anon, authenticated;
GRANT SELECT ON cms_logos TO anon, authenticated;
GRANT SELECT ON cms_metrics TO anon, authenticated;
GRANT SELECT ON cms_team TO anon, authenticated;
GRANT SELECT ON cms_videos TO anon, authenticated;
GRANT SELECT ON cms_case_studies TO anon, authenticated;
GRANT SELECT ON cms_testimonials TO anon, authenticated;
GRANT SELECT ON cms_resources TO anon, authenticated;
GRANT SELECT ON cms_integrations TO anon, authenticated;

DROP POLICY IF EXISTS cms_homepage_sections_public_approved_read ON cms_homepage_sections;
CREATE POLICY cms_homepage_sections_public_approved_read ON cms_homepage_sections
  FOR SELECT USING (approved_for_public = true);
DROP POLICY IF EXISTS cms_media_assets_public_approved_read ON cms_media_assets;
CREATE POLICY cms_media_assets_public_approved_read ON cms_media_assets
  FOR SELECT USING (approved_for_public = true);
DROP POLICY IF EXISTS cms_logos_public_approved_read ON cms_logos;
CREATE POLICY cms_logos_public_approved_read ON cms_logos
  FOR SELECT USING (approved_for_public = true);
DROP POLICY IF EXISTS cms_metrics_public_approved_read ON cms_metrics;
CREATE POLICY cms_metrics_public_approved_read ON cms_metrics
  FOR SELECT USING (approved_for_public = true);
DROP POLICY IF EXISTS cms_team_public_approved_read ON cms_team;
CREATE POLICY cms_team_public_approved_read ON cms_team
  FOR SELECT USING (approved_for_public = true);
DROP POLICY IF EXISTS cms_videos_public_approved_read ON cms_videos;
CREATE POLICY cms_videos_public_approved_read ON cms_videos
  FOR SELECT USING (approved_for_public = true);
DROP POLICY IF EXISTS cms_case_studies_public_approved_read ON cms_case_studies;
CREATE POLICY cms_case_studies_public_approved_read ON cms_case_studies
  FOR SELECT USING (approved_for_public = true);
DROP POLICY IF EXISTS cms_testimonials_public_approved_read ON cms_testimonials;
CREATE POLICY cms_testimonials_public_approved_read ON cms_testimonials
  FOR SELECT USING (approved_for_public = true);
DROP POLICY IF EXISTS cms_resources_public_approved_read ON cms_resources;
CREATE POLICY cms_resources_public_approved_read ON cms_resources
  FOR SELECT USING (approved_for_public = true);
DROP POLICY IF EXISTS cms_integrations_public_approved_read ON cms_integrations;
CREATE POLICY cms_integrations_public_approved_read ON cms_integrations
  FOR SELECT USING (approved_for_public = true);

INSERT INTO cms_homepage_sections (section_key, eyebrow, headline, body, enabled, approved_for_public, display_order)
VALUES
  ('hero', 'AI OPERATIONS FOR F&B', 'Run a smarter back of house.', 'Neumas turns invoices, receipts, inventory movements and consumption history into cleaner stock records, forecasts, reorder plans and operational intelligence for F&B teams.', true, true, 10),
  ('platform', 'PLATFORM', 'One platform. Every operational decision.', 'Neumas connects daily operational inputs to decision-ready intelligence for F&B teams.', true, true, 20),
  ('conversion', 'BOOK A DEMO', 'See Neumas in your operation.', 'Share your outlet profile, purchasing workflow, and current operating challenge. Neumas will map the right demo path without requiring a login.', true, true, 90)
ON CONFLICT (section_key) DO NOTHING;
