DO $$
DECLARE
  org_table text;
  property_table text;
BEGIN
  FOREACH org_table IN ARRAY ARRAY[
    'units_of_measure',
    'uom_conversions',
    'canonical_ingredients',
    'ingredient_aliases',
    'recipe_ingredients',
    'sales_transaction_items',
    'demand_forecast_items',
    'policy_rules',
    'decision_evidence',
    'action_attempts',
    'purchase_order_items',
    'purchase_order_events',
    'supplier_acknowledgement_items',
    'goods_receipt_items',
    'supplier_invoice_items',
    'reconciliation_issues'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON %I', org_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON %I', org_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %I', org_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %I', org_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_delete_admin ON %I', org_table);

    EXECUTE format('CREATE POLICY service_role_all ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', org_table);
    EXECUTE format('CREATE POLICY tenant_select ON %I FOR SELECT TO authenticated USING (organization_id = public.org_id())', org_table);
    EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT TO authenticated WITH CHECK (organization_id = public.org_id())', org_table);
    EXECUTE format('CREATE POLICY tenant_update ON %I FOR UPDATE TO authenticated USING (organization_id = public.org_id()) WITH CHECK (organization_id = public.org_id())', org_table);
    EXECUTE format('CREATE POLICY tenant_delete_admin ON %I FOR DELETE TO authenticated USING (organization_id = public.org_id() AND public.is_org_admin())', org_table);
  END LOOP;

  FOREACH property_table IN ARRAY ARRAY[
    'recipes',
    'recipe_versions',
    'menu_items',
    'menu_item_recipe_links',
    'supplier_items',
    'supplier_item_prices',
    'raw_imports',
    'import_receipts',
    'sales_transactions',
    'demand_signals',
    'forecast_runs',
    'demand_forecasts',
    'forecast_evaluations',
    'supplier_item_offers',
    'supplier_performance_metrics',
    'procurement_recommendations',
    'policies',
    'decisions',
    'approvals',
    'actions',
    'verifications',
    'outcomes',
    'purchase_orders',
    'supplier_acknowledgements',
    'goods_receipts',
    'supplier_invoices',
    'reconciliation_cases',
    'margin_snapshots',
    'margin_attribution_events',
    'waste_events',
    'outcome_learning_events',
    'raw_provider_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON %I', property_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON %I', property_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %I', property_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %I', property_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_delete_admin ON %I', property_table);

    EXECUTE format('CREATE POLICY service_role_all ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', property_table);
    EXECUTE format(
      'CREATE POLICY tenant_select ON %I FOR SELECT TO authenticated USING (organization_id = public.org_id() AND (property_id IS NULL OR public.can_access_property(property_id)))',
      property_table
    );
    EXECUTE format(
      'CREATE POLICY tenant_insert ON %I FOR INSERT TO authenticated WITH CHECK (organization_id = public.org_id() AND (property_id IS NULL OR public.can_access_property(property_id)))',
      property_table
    );
    EXECUTE format(
      'CREATE POLICY tenant_update ON %I FOR UPDATE TO authenticated USING (organization_id = public.org_id() AND (property_id IS NULL OR public.can_access_property(property_id))) WITH CHECK (organization_id = public.org_id() AND (property_id IS NULL OR public.can_access_property(property_id)))',
      property_table
    );
    EXECUTE format(
      'CREATE POLICY tenant_delete_admin ON %I FOR DELETE TO authenticated USING (organization_id = public.org_id() AND public.is_org_admin() AND (property_id IS NULL OR public.can_access_property(property_id)))',
      property_table
    );
  END LOOP;
END $$;
