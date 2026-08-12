ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS org_type text,
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarding_source text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS activation_milestones jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS property_type text,
  ADD COLUMN IF NOT EXISTS onboarding_order integer,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_key text;

CREATE INDEX IF NOT EXISTS idx_organizations_onboarding_status
  ON organizations(onboarding_status);

CREATE INDEX IF NOT EXISTS idx_properties_org_primary
  ON properties(organization_id, is_primary);

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_org_onboarding_key
  ON properties(organization_id, onboarding_key)
  WHERE onboarding_key IS NOT NULL;

UPDATE properties
SET is_primary = true
WHERE id IN (
  SELECT p.id
  FROM properties p
  JOIN (
    SELECT organization_id, MIN(created_at) AS created_at
    FROM properties
    GROUP BY organization_id
  ) first_props
    ON first_props.organization_id = p.organization_id
   AND first_props.created_at = p.created_at
)
AND COALESCE(is_primary, false) = false;

UPDATE properties
SET onboarding_order = 1
WHERE COALESCE(is_primary, false) = true
  AND onboarding_order IS NULL;
