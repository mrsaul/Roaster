
-- Add sync control fields to client_onboarding
ALTER TABLE public.client_onboarding
  ADD COLUMN IF NOT EXISTS client_data_mode text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS custom_company_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_contact_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_email text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_phone text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_delivery_address text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_pricing_tier text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone DEFAULT NULL;

COMMENT ON COLUMN public.client_onboarding.client_data_mode IS 'sellsy = synced from Sellsy, custom = app override';
