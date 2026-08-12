CREATE TABLE IF NOT EXISTS pilot_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  business_type text NOT NULL,
  outlet_count text NOT NULL,
  current_workflow text NOT NULL,
  preferred_start date,
  source text NOT NULL DEFAULT 'pilot_page',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  status text NOT NULL DEFAULT 'NEW',
  provisioned_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  provisioned_property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  provisioned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_leads_company_email_unique
  ON pilot_leads (lower(company_name), lower(email));
