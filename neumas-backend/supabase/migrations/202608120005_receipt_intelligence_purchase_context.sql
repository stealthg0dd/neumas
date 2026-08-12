ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS subtotal_amount numeric(12,4),
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12,4),
  ADD COLUMN IF NOT EXISTS document_number text;

ALTER TABLE document_line_items
  ADD COLUMN IF NOT EXISTS category_name text,
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS pack_size text,
  ADD COLUMN IF NOT EXISTS supplier_sku text;
