-- Fix stored function that still references public.client_onboarding
-- (renamed to public.client_onboarding_legacy in migration 20260509000003)
-- PostgreSQL does not update stored function bodies on RENAME TABLE.

CREATE OR REPLACE FUNCTION public.user_update_own_onboarding(
  _id uuid,
  _company_name text DEFAULT NULL,
  _legal_company_name text DEFAULT NULL,
  _vat_number text DEFAULT NULL,
  _siret text DEFAULT NULL,
  _contact_name text DEFAULT NULL,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _delivery_address text DEFAULT NULL,
  _delivery_instructions text DEFAULT NULL,
  _preferred_delivery_days text[] DEFAULT NULL,
  _delivery_time_window text DEFAULT NULL,
  _coffee_type text DEFAULT NULL,
  _grinder_type text DEFAULT NULL,
  _estimated_weekly_volume numeric DEFAULT NULL,
  _notes text DEFAULT NULL,
  _current_step integer DEFAULT NULL,
  _custom_company_name text DEFAULT NULL,
  _custom_contact_name text DEFAULT NULL,
  _custom_email text DEFAULT NULL,
  _custom_phone text DEFAULT NULL,
  _custom_delivery_address text DEFAULT NULL,
  _onboarding_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- If trying to set onboarding_status, validate the transition
  IF _onboarding_status IS NOT NULL THEN
    SELECT onboarding_status INTO _current_status
    FROM public.client_onboarding_legacy
    WHERE id = _id AND user_id = auth.uid();

    -- Only allow pending -> completed transition for users
    IF _onboarding_status != 'completed' OR _current_status != 'pending' THEN
      RAISE EXCEPTION 'Invalid status transition';
    END IF;
  END IF;

  UPDATE public.client_onboarding_legacy
  SET
    company_name = COALESCE(_company_name, company_name),
    legal_company_name = COALESCE(_legal_company_name, legal_company_name),
    vat_number = COALESCE(_vat_number, vat_number),
    siret = COALESCE(_siret, siret),
    contact_name = COALESCE(_contact_name, contact_name),
    email = COALESCE(_email, email),
    phone = COALESCE(_phone, phone),
    delivery_address = COALESCE(_delivery_address, delivery_address),
    delivery_instructions = COALESCE(_delivery_instructions, delivery_instructions),
    preferred_delivery_days = COALESCE(_preferred_delivery_days, preferred_delivery_days),
    delivery_time_window = COALESCE(_delivery_time_window, delivery_time_window),
    coffee_type = COALESCE(_coffee_type, coffee_type),
    grinder_type = COALESCE(_grinder_type, grinder_type),
    estimated_weekly_volume = COALESCE(_estimated_weekly_volume, estimated_weekly_volume),
    notes = COALESCE(_notes, notes),
    current_step = COALESCE(_current_step, current_step),
    custom_company_name = COALESCE(_custom_company_name, custom_company_name),
    custom_contact_name = COALESCE(_custom_contact_name, custom_contact_name),
    custom_email = COALESCE(_custom_email, custom_email),
    custom_phone = COALESCE(_custom_phone, custom_phone),
    custom_delivery_address = COALESCE(_custom_delivery_address, custom_delivery_address),
    onboarding_status = COALESCE(_onboarding_status, onboarding_status),
    updated_at = now()
  WHERE id = _id AND user_id = auth.uid();
END;
$$;
