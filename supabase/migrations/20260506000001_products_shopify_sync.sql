-- Step 2: Add Shopify product sync fields + make sellsy_id nullable
-- HIDDEN — Sellsy — sellsy_id preserved, just made nullable

-- Make sellsy_id nullable (was NOT NULL)
ALTER TABLE products
  ALTER COLUMN sellsy_id DROP NOT NULL;

-- Add Shopify sync columns (idempotent)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS shopify_product_id  text UNIQUE,
  ADD COLUMN IF NOT EXISTS shopify_variant_id  text,
  ADD COLUMN IF NOT EXISTS shopify_synced_at   timestamptz,
  ADD COLUMN IF NOT EXISTS source              text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('shopify', 'manual'));

-- Default SKU trigger: if sku is null when a row is inserted, set it to the product id prefix
CREATE OR REPLACE FUNCTION set_default_sku()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sku IS NULL THEN
    NEW.sku := 'PRD-' || LEFT(NEW.id::text, 8);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_sku ON products;
CREATE TRIGGER trg_set_default_sku
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION set_default_sku();
