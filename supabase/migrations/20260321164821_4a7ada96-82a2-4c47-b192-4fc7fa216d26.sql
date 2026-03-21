
-- Add data source mode and custom override fields
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS data_source_mode text NOT NULL DEFAULT 'sellsy',
  ADD COLUMN IF NOT EXISTS custom_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_price_per_kg numeric DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.products.data_source_mode IS 'sellsy = synced from Sellsy, custom = app override';
COMMENT ON COLUMN public.products.custom_name IS 'App-only name override (used when data_source_mode = custom)';
COMMENT ON COLUMN public.products.custom_price_per_kg IS 'App-only price override (used when data_source_mode = custom)';
