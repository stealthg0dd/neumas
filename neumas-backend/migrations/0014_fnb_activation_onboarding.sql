ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS activation_milestones jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onboarding_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_org_onboarding_key
  ON properties(organization_id, onboarding_key)
  WHERE onboarding_key IS NOT NULL;
