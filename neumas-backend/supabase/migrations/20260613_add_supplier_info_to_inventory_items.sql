-- Add supplier_info column to inventory_items.
--
-- supplier_info has been part of the aspirational schema (schema.sql /
-- schema_02_tenant_inventory.sql) and is read/written by
-- app/db/repositories/inventory.py, app/services/inventory_service.py and
-- app/tasks/scan_tasks.py, but was never added to the live database. The
-- inventory repository detects the missing column and silently retries
-- without it ("Inventory schema drift detected; retrying ... without
-- missing column"), so supplier info is dropped from API responses.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS supplier_info jsonb NOT NULL DEFAULT '{}'::jsonb;
