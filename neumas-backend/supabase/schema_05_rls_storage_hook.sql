-- =============================================================================
-- BLOCK 5 of 5: RLS Policies + Storage + JWT Hook
-- Requires blocks 1-4. All tables must exist before this block.
-- =============================================================================

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- organizations
DROP POLICY IF EXISTS svc_organizations ON organizations;
CREATE POLICY svc_organizations ON organizations FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS org_select ON organizations;
CREATE POLICY org_select ON organizations FOR SELECT USING (id = public.org_id());
DROP POLICY IF EXISTS org_update ON organizations;
CREATE POLICY org_update ON organizations FOR UPDATE
  USING (id = public.org_id() AND public.is_org_admin());

-- properties
DROP POLICY IF EXISTS svc_properties ON properties;
CREATE POLICY svc_properties ON properties FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS prop_select ON properties;
CREATE POLICY prop_select ON properties FOR SELECT USING (organization_id = public.org_id());
DROP POLICY IF EXISTS prop_insert ON properties;
CREATE POLICY prop_insert ON properties FOR INSERT
  WITH CHECK (organization_id = public.org_id() AND public.is_org_admin());
DROP POLICY IF EXISTS prop_update ON properties;
CREATE POLICY prop_update ON properties FOR UPDATE
  USING (organization_id = public.org_id() AND public.is_org_admin());
DROP POLICY IF EXISTS prop_delete ON properties;
CREATE POLICY prop_delete ON properties FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- users
DROP POLICY IF EXISTS svc_users ON users;
CREATE POLICY svc_users ON users FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS user_select ON users;
CREATE POLICY user_select ON users FOR SELECT USING (organization_id = public.org_id());
DROP POLICY IF EXISTS user_insert ON users;
CREATE POLICY user_insert ON users FOR INSERT
  WITH CHECK (organization_id = public.org_id() AND public.is_org_admin());
DROP POLICY IF EXISTS user_update ON users;
CREATE POLICY user_update ON users FOR UPDATE
  USING (organization_id = public.org_id() AND (public.is_org_admin() OR auth_id = auth.uid()));
DROP POLICY IF EXISTS user_delete ON users;
CREATE POLICY user_delete ON users FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- inventory_categories
DROP POLICY IF EXISTS svc_categories ON inventory_categories;
CREATE POLICY svc_categories ON inventory_categories FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS cat_select ON inventory_categories;
CREATE POLICY cat_select ON inventory_categories FOR SELECT USING (organization_id = public.org_id());
DROP POLICY IF EXISTS cat_insert ON inventory_categories;
CREATE POLICY cat_insert ON inventory_categories FOR INSERT WITH CHECK (organization_id = public.org_id());
DROP POLICY IF EXISTS cat_update ON inventory_categories;
CREATE POLICY cat_update ON inventory_categories FOR UPDATE USING (organization_id = public.org_id());
DROP POLICY IF EXISTS cat_delete ON inventory_categories;
CREATE POLICY cat_delete ON inventory_categories FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- inventory_items
DROP POLICY IF EXISTS svc_inventory ON inventory_items;
CREATE POLICY svc_inventory ON inventory_items FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS inv_select ON inventory_items;
CREATE POLICY inv_select ON inventory_items FOR SELECT USING (public.can_access_property(property_id));
DROP POLICY IF EXISTS inv_insert ON inventory_items;
CREATE POLICY inv_insert ON inventory_items FOR INSERT WITH CHECK (public.can_access_property(property_id));
DROP POLICY IF EXISTS inv_update ON inventory_items;
CREATE POLICY inv_update ON inventory_items FOR UPDATE USING (public.can_access_property(property_id));
DROP POLICY IF EXISTS inv_delete ON inventory_items;
CREATE POLICY inv_delete ON inventory_items FOR DELETE
  USING (public.can_access_property(property_id) AND public.is_org_admin());

-- inventory_movements
DROP POLICY IF EXISTS svc_movements ON inventory_movements;
CREATE POLICY svc_movements ON inventory_movements FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS mov_select ON inventory_movements;
CREATE POLICY mov_select ON inventory_movements FOR SELECT
  USING (public.can_access_property(property_id));

-- scans
DROP POLICY IF EXISTS svc_scans ON scans;
CREATE POLICY svc_scans ON scans FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS scan_select ON scans;
CREATE POLICY scan_select ON scans FOR SELECT USING (public.can_access_property(property_id));
DROP POLICY IF EXISTS scan_insert ON scans;
CREATE POLICY scan_insert ON scans FOR INSERT WITH CHECK (public.can_access_property(property_id));
DROP POLICY IF EXISTS scan_update ON scans;
CREATE POLICY scan_update ON scans FOR UPDATE USING (public.can_access_property(property_id));
DROP POLICY IF EXISTS scan_delete ON scans;
CREATE POLICY scan_delete ON scans FOR DELETE
  USING (public.can_access_property(property_id)
    AND (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()) OR public.is_org_admin()));

-- vendors
DROP POLICY IF EXISTS svc_vendors ON vendors;
CREATE POLICY svc_vendors ON vendors FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS vendor_select ON vendors;
CREATE POLICY vendor_select ON vendors FOR SELECT USING (organization_id = public.org_id());
DROP POLICY IF EXISTS vendor_insert ON vendors;
CREATE POLICY vendor_insert ON vendors FOR INSERT WITH CHECK (organization_id = public.org_id());
DROP POLICY IF EXISTS vendor_update ON vendors;
CREATE POLICY vendor_update ON vendors FOR UPDATE USING (organization_id = public.org_id());
DROP POLICY IF EXISTS vendor_delete ON vendors;
CREATE POLICY vendor_delete ON vendors FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- vendor_aliases
DROP POLICY IF EXISTS svc_vendor_aliases ON vendor_aliases;
CREATE POLICY svc_vendor_aliases ON vendor_aliases FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS vendor_alias_select ON vendor_aliases;
CREATE POLICY vendor_alias_select ON vendor_aliases FOR SELECT USING (organization_id = public.org_id());
DROP POLICY IF EXISTS vendor_alias_insert ON vendor_aliases;
CREATE POLICY vendor_alias_insert ON vendor_aliases FOR INSERT WITH CHECK (organization_id = public.org_id());
DROP POLICY IF EXISTS vendor_alias_delete ON vendor_aliases;
CREATE POLICY vendor_alias_delete ON vendor_aliases FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- canonical_items
DROP POLICY IF EXISTS svc_canonical_items ON canonical_items;
CREATE POLICY svc_canonical_items ON canonical_items FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS canonical_select ON canonical_items;
CREATE POLICY canonical_select ON canonical_items FOR SELECT USING (organization_id = public.org_id());
DROP POLICY IF EXISTS canonical_insert ON canonical_items;
CREATE POLICY canonical_insert ON canonical_items FOR INSERT WITH CHECK (organization_id = public.org_id());
DROP POLICY IF EXISTS canonical_update ON canonical_items;
CREATE POLICY canonical_update ON canonical_items FOR UPDATE USING (organization_id = public.org_id());
DROP POLICY IF EXISTS canonical_delete ON canonical_items;
CREATE POLICY canonical_delete ON canonical_items FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- item_aliases
DROP POLICY IF EXISTS svc_item_aliases ON item_aliases;
CREATE POLICY svc_item_aliases ON item_aliases FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS item_alias_select ON item_aliases;
CREATE POLICY item_alias_select ON item_aliases FOR SELECT USING (organization_id = public.org_id());
DROP POLICY IF EXISTS item_alias_insert ON item_aliases;
CREATE POLICY item_alias_insert ON item_aliases FOR INSERT WITH CHECK (organization_id = public.org_id());
DROP POLICY IF EXISTS item_alias_delete ON item_aliases;
CREATE POLICY item_alias_delete ON item_aliases FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- documents
DROP POLICY IF EXISTS svc_documents ON documents;
CREATE POLICY svc_documents ON documents FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS doc_select ON documents;
CREATE POLICY doc_select ON documents FOR SELECT USING (organization_id = public.org_id());
DROP POLICY IF EXISTS doc_insert ON documents;
CREATE POLICY doc_insert ON documents FOR INSERT WITH CHECK (organization_id = public.org_id());
DROP POLICY IF EXISTS doc_update ON documents;
CREATE POLICY doc_update ON documents FOR UPDATE USING (organization_id = public.org_id());
DROP POLICY IF EXISTS doc_delete ON documents;
CREATE POLICY doc_delete ON documents FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- document_line_items
DROP POLICY IF EXISTS svc_dli ON document_line_items;
CREATE POLICY svc_dli ON document_line_items FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS dli_select ON document_line_items;
CREATE POLICY dli_select ON document_line_items FOR SELECT USING (organization_id = public.org_id());
DROP POLICY IF EXISTS dli_insert ON document_line_items;
CREATE POLICY dli_insert ON document_line_items FOR INSERT WITH CHECK (organization_id = public.org_id());
DROP POLICY IF EXISTS dli_update ON document_line_items;
CREATE POLICY dli_update ON document_line_items FOR UPDATE USING (organization_id = public.org_id());
DROP POLICY IF EXISTS dli_delete ON document_line_items;
CREATE POLICY dli_delete ON document_line_items FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- consumption_patterns
DROP POLICY IF EXISTS svc_patterns ON consumption_patterns;
CREATE POLICY svc_patterns ON consumption_patterns FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS pattern_select ON consumption_patterns;
CREATE POLICY pattern_select ON consumption_patterns FOR SELECT
  USING (public.can_access_property(property_id));
DROP POLICY IF EXISTS pattern_insert ON consumption_patterns;
CREATE POLICY pattern_insert ON consumption_patterns FOR INSERT
  WITH CHECK (public.can_access_property(property_id));
DROP POLICY IF EXISTS pattern_update ON consumption_patterns;
CREATE POLICY pattern_update ON consumption_patterns FOR UPDATE
  USING (public.can_access_property(property_id));

-- predictions
DROP POLICY IF EXISTS svc_predictions ON predictions;
CREATE POLICY svc_predictions ON predictions FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS pred_select ON predictions;
CREATE POLICY pred_select ON predictions FOR SELECT USING (public.can_access_property(property_id));
DROP POLICY IF EXISTS pred_insert ON predictions;
CREATE POLICY pred_insert ON predictions FOR INSERT WITH CHECK (public.can_access_property(property_id));
DROP POLICY IF EXISTS pred_update ON predictions;
CREATE POLICY pred_update ON predictions FOR UPDATE USING (public.can_access_property(property_id));

-- shopping_lists
DROP POLICY IF EXISTS svc_shopping_lists ON shopping_lists;
CREATE POLICY svc_shopping_lists ON shopping_lists FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS sl_select ON shopping_lists;
CREATE POLICY sl_select ON shopping_lists FOR SELECT USING (public.can_access_property(property_id));
DROP POLICY IF EXISTS sl_insert ON shopping_lists;
CREATE POLICY sl_insert ON shopping_lists FOR INSERT WITH CHECK (public.can_access_property(property_id));
DROP POLICY IF EXISTS sl_update ON shopping_lists;
CREATE POLICY sl_update ON shopping_lists FOR UPDATE USING (public.can_access_property(property_id));
DROP POLICY IF EXISTS sl_delete ON shopping_lists;
CREATE POLICY sl_delete ON shopping_lists FOR DELETE
  USING (public.can_access_property(property_id) AND public.is_org_admin());

-- shopping_list_items
DROP POLICY IF EXISTS svc_sli ON shopping_list_items;
CREATE POLICY svc_sli ON shopping_list_items FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS sli_select ON shopping_list_items;
CREATE POLICY sli_select ON shopping_list_items FOR SELECT
  USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE public.can_access_property(property_id)));
DROP POLICY IF EXISTS sli_insert ON shopping_list_items;
CREATE POLICY sli_insert ON shopping_list_items FOR INSERT
  WITH CHECK (shopping_list_id IN (SELECT id FROM shopping_lists WHERE public.can_access_property(property_id)));
DROP POLICY IF EXISTS sli_update ON shopping_list_items;
CREATE POLICY sli_update ON shopping_list_items FOR UPDATE
  USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE public.can_access_property(property_id)));
DROP POLICY IF EXISTS sli_delete ON shopping_list_items;
CREATE POLICY sli_delete ON shopping_list_items FOR DELETE
  USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE public.can_access_property(property_id)));

-- alerts
DROP POLICY IF EXISTS svc_alerts ON alerts;
CREATE POLICY svc_alerts ON alerts FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS alert_select ON alerts;
CREATE POLICY alert_select ON alerts FOR SELECT USING (organization_id = public.org_id());
DROP POLICY IF EXISTS alert_insert ON alerts;
CREATE POLICY alert_insert ON alerts FOR INSERT WITH CHECK (organization_id = public.org_id());
DROP POLICY IF EXISTS alert_update ON alerts;
CREATE POLICY alert_update ON alerts FOR UPDATE USING (organization_id = public.org_id());
DROP POLICY IF EXISTS alert_delete ON alerts;
CREATE POLICY alert_delete ON alerts FOR DELETE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- audit_logs
DROP POLICY IF EXISTS svc_audit ON audit_logs;
CREATE POLICY svc_audit ON audit_logs FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS audit_select ON audit_logs;
CREATE POLICY audit_select ON audit_logs FOR SELECT
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- usage_events
DROP POLICY IF EXISTS svc_usage ON usage_events;
CREATE POLICY svc_usage ON usage_events FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS usage_select ON usage_events;
CREATE POLICY usage_select ON usage_events FOR SELECT
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- reports
DROP POLICY IF EXISTS svc_reports ON reports;
CREATE POLICY svc_reports ON reports FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS report_select ON reports;
CREATE POLICY report_select ON reports FOR SELECT USING (organization_id = public.org_id());
DROP POLICY IF EXISTS report_insert ON reports;
CREATE POLICY report_insert ON reports FOR INSERT WITH CHECK (organization_id = public.org_id());
DROP POLICY IF EXISTS report_update ON reports;
CREATE POLICY report_update ON reports FOR UPDATE
  USING (organization_id = public.org_id() AND public.is_org_admin());

-- feature_flags
DROP POLICY IF EXISTS svc_feature_flags ON feature_flags;
CREATE POLICY svc_feature_flags ON feature_flags FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS ff_select ON feature_flags;
CREATE POLICY ff_select ON feature_flags FOR SELECT
  USING (public.is_org_admin() AND (organization_id = public.org_id() OR organization_id IS NULL));

-- research_posts
DROP POLICY IF EXISTS svc_research ON research_posts;
CREATE POLICY svc_research ON research_posts FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS research_public_read ON research_posts;
CREATE POLICY research_public_read ON research_posts FOR SELECT USING (published = true);


-- =============================================================================
-- STORAGE
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('scans', 'scans', FALSE, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS storage_service_role_all ON storage.objects;
DROP POLICY IF EXISTS "storage_service_role_all" ON storage.objects;
CREATE POLICY "storage_service_role_all" ON storage.objects FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS storage_users_upload_receipts ON storage.objects;
DROP POLICY IF EXISTS "storage_users_upload_receipts" ON storage.objects;
CREATE POLICY "storage_users_upload_receipts" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'scans' AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'org_id'));

DROP POLICY IF EXISTS storage_users_read_receipts ON storage.objects;
DROP POLICY IF EXISTS "storage_users_read_receipts" ON storage.objects;
CREATE POLICY "storage_users_read_receipts" ON storage.objects FOR SELECT
  USING (bucket_id = 'scans' AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'org_id'));


-- =============================================================================
-- JWT CUSTOM CLAIMS HOOK
-- After running: Dashboard → Authentication → Hooks → Custom Access Token Hook
--   → select public.custom_access_token_hook → Save
-- =============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  claims   jsonb;
  usr      record;
  prop_ids text[];
BEGIN
  SELECT u.organization_id, u.role INTO usr
    FROM public.users u
   WHERE u.auth_id = (event->>'user_id')::uuid;

  IF FOUND THEN
    SELECT ARRAY(
      SELECT p.id::text FROM public.properties p
       WHERE p.organization_id = usr.organization_id
         AND p.is_active = true
    ) INTO prop_ids;

    claims := event->'claims';
    claims := jsonb_set(claims, '{org_id}',       to_jsonb(usr.organization_id::text));
    claims := jsonb_set(claims, '{role}',         to_jsonb(usr.role));
    claims := jsonb_set(claims, '{property_ids}', to_jsonb(prop_ids));
    RETURN jsonb_set(event, '{claims}', claims);
  END IF;

  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon;
