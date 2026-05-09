-- ── 1. Copy client_onboarding → companies ────────────────────────────────────
-- Preserving original UUIDs so existing FK references continue to work.
INSERT INTO public.companies (
  id, sellsy_id, name, email, phone,
  vat_number, siret, notes, sellsy_client_id,
  client_data_mode, onboarding_status, current_step,
  pricing_tier_id, rate_category, admin_notes, last_synced_at,
  legal_company_name, preferred_delivery_days, delivery_time_window,
  delivery_instructions, coffee_type, estimated_weekly_volume, grinder_type,
  created_at, updated_at
)
SELECT
  id,
  sellsy_client_id,
  COALESCE(NULLIF(TRIM(custom_company_name), ''), NULLIF(TRIM(company_name), ''), NULLIF(TRIM(email), ''), 'Unknown'),
  COALESCE(NULLIF(TRIM(custom_email), ''), NULLIF(TRIM(email), '')),
  COALESCE(NULLIF(TRIM(custom_phone), ''), NULLIF(TRIM(phone), '')),
  vat_number, siret, notes, sellsy_client_id,
  client_data_mode, onboarding_status, current_step,
  pricing_tier_id,
  COALESCE(NULLIF(TRIM(custom_pricing_tier), ''), NULLIF(TRIM(pricing_tier), '')),
  admin_notes, last_synced_at, legal_company_name,
  preferred_delivery_days, delivery_time_window, delivery_instructions,
  coffee_type, estimated_weekly_volume, grinder_type,
  created_at, updated_at
FROM public.client_onboarding
ON CONFLICT (id) DO NOTHING;

-- ── 2. Copy delivery addresses → company_addresses ────────────────────────────
INSERT INTO public.company_addresses (company_id, label, address_line1, created_at, updated_at)
SELECT
  id,
  'Delivery',
  COALESCE(NULLIF(TRIM(custom_delivery_address), ''), NULLIF(TRIM(delivery_address), '')),
  created_at,
  updated_at
FROM public.client_onboarding
WHERE COALESCE(NULLIF(TRIM(custom_delivery_address), ''), NULLIF(TRIM(delivery_address), '')) IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 3. Create primary contacts → contacts ─────────────────────────────────────
-- user_id is set to NULL for orphaned rows (user deleted from auth.users)
-- to avoid violating the FK constraint.
INSERT INTO public.contacts (
  company_id, user_id, last_name, email, phone, is_primary, created_at, updated_at
)
SELECT
  id,
  CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = co.user_id)
       THEN co.user_id
       ELSE NULL
  END,
  COALESCE(
    NULLIF(TRIM(custom_contact_name), ''),
    NULLIF(TRIM(contact_name), ''),
    NULLIF(TRIM(custom_company_name), ''),
    NULLIF(TRIM(company_name), ''),
    'Contact'
  ),
  COALESCE(NULLIF(TRIM(custom_email), ''), NULLIF(TRIM(email), '')),
  COALESCE(NULLIF(TRIM(custom_phone), ''), NULLIF(TRIM(phone), '')),
  true,
  created_at,
  updated_at
FROM public.client_onboarding co
ON CONFLICT DO NOTHING;

-- ── 4. Rename client_onboarding → client_onboarding_legacy ───────────────────
-- Guard against repeated runs (table may already be renamed).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'client_onboarding'
  ) THEN
    ALTER TABLE public.client_onboarding RENAME TO client_onboarding_legacy;
  END IF;
END
$$;
