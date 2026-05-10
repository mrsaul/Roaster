-- Add invoice tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sellsy_invoice_id     TEXT,
  ADD COLUMN IF NOT EXISTS sellsy_invoice_status TEXT NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS sellsy_invoice_error  TEXT,
  ADD COLUMN IF NOT EXISTS invoiced_at           TIMESTAMPTZ;

-- Valid values: not_sent | draft | sent | paid | error
COMMENT ON COLUMN public.orders.sellsy_invoice_status IS 'not_sent | draft | sent | paid | error';

-- Add Sellsy tax fields to products (populated during product sync)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sellsy_tax_id   TEXT,
  ADD COLUMN IF NOT EXISTS sellsy_tax_rate NUMERIC(5,2);
