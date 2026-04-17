-- =============================================================================
-- BLOCK 1 of 5: Extensions + Helper Functions
-- Run this first. No table dependencies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram indexes for fuzzy search


-- =============================================================================
-- HELPER FUNCTIONS  (public schema, SECURITY DEFINER)
-- NOTE: These are intentionally in the public schema — NOT the auth schema.
--       Supabase restricts CREATE FUNCTION in the auth schema (error 42501).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT (auth.jwt() ->> 'role') = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT (auth.jwt() ->> 'org_id')::uuid;
$$;

-- plpgsql (not sql) so body is NOT validated at CREATE time.
-- Safe to define before the properties table exists on an existing DB.
CREATE OR REPLACE FUNCTION public.can_access_property(p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF (auth.jwt() ->> 'role') = 'admin' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.properties
      WHERE id = p_id
        AND organization_id = (auth.jwt() ->> 'org_id')::uuid
    );
  ELSE
    RETURN p_id::text = ANY(
      ARRAY(SELECT jsonb_array_elements_text(
        COALESCE(auth.jwt() -> 'property_ids', '[]'::jsonb)
      ))
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Grant helper functions to authenticated and anon so RLS policies can invoke them
GRANT EXECUTE ON FUNCTION public.is_org_admin()            TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.org_id()                  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_property(uuid) TO authenticated, anon;
