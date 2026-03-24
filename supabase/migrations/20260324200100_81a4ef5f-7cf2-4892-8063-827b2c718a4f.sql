
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS invoicing_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS last_invoice_sync timestamp with time zone;
