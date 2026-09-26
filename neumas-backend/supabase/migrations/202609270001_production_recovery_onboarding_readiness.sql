CREATE TABLE IF NOT EXISTS organization_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'ACCOUNT_CREATED',
  completed_steps text[] NOT NULL DEFAULT ARRAY[]::text[],
  missing_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  operating_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_onboarding_stage_check CHECK (
    stage IN (
      'ACCOUNT_CREATED',
      'ORGANIZATION_CREATED',
      'LOCATION_CREATED',
      'OPERATING_PROFILE_SET',
      'DATA_SOURCE_SELECTED',
      'DATA_CONNECTED',
      'BASELINE_PROCESSING',
      'READY'
    )
  ),
  CONSTRAINT organization_onboarding_org_unique UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_onboarding_org
  ON organization_onboarding(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_onboarding_property
  ON organization_onboarding(property_id);

ALTER TABLE organization_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_onboarding_service_role_all ON organization_onboarding;
CREATE POLICY organization_onboarding_service_role_all
  ON organization_onboarding FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS organization_onboarding_tenant_select ON organization_onboarding;
CREATE POLICY organization_onboarding_tenant_select
  ON organization_onboarding FOR SELECT
  USING (organization_id = public.org_id());

DROP POLICY IF EXISTS organization_onboarding_tenant_insert ON organization_onboarding;
CREATE POLICY organization_onboarding_tenant_insert
  ON organization_onboarding FOR INSERT
  WITH CHECK (organization_id = public.org_id());

DROP POLICY IF EXISTS organization_onboarding_tenant_update ON organization_onboarding;
CREATE POLICY organization_onboarding_tenant_update
  ON organization_onboarding FOR UPDATE
  USING (organization_id = public.org_id())
  WITH CHECK (organization_id = public.org_id());

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_organization_onboarding_updated_at ON organization_onboarding;
    CREATE TRIGGER trg_organization_onboarding_updated_at
      BEFORE UPDATE ON organization_onboarding
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
