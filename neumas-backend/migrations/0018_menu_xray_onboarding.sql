-- Menu X-Ray onboarding metadata
-- Backward-compatible additions only.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_role text,
  ADD COLUMN IF NOT EXISTS onboarding_goal text;
