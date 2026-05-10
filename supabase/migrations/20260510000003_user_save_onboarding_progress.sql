-- SECURITY DEFINER function for client onboarding saves.
-- Regular users cannot INSERT into companies/contacts/company_addresses (admin-only RLS),
-- so we need an elevated function that enforces its own security rules.
CREATE OR REPLACE FUNCTION public.user_save_onboarding_progress(
  _company_name             text        DEFAULT NULL,
  _legal_company_name       text        DEFAULT NULL,
  _vat_number               text        DEFAULT NULL,
  _siret                    text        DEFAULT NULL,
  _email                    text        DEFAULT NULL,
  _phone                    text        DEFAULT NULL,
  _contact_name             text        DEFAULT NULL,
  _delivery_address         text        DEFAULT NULL,
  _delivery_instructions    text        DEFAULT NULL,
  _preferred_delivery_days  text[]      DEFAULT NULL,
  _delivery_time_window     text        DEFAULT NULL,
  _coffee_type              text        DEFAULT NULL,
  _estimated_weekly_volume  numeric     DEFAULT NULL,
  _grinder_type             text        DEFAULT NULL,
  _notes                    text        DEFAULT NULL,
  _current_step             integer     DEFAULT NULL,
  _onboarding_status        text        DEFAULT 'pending'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid          uuid := auth.uid();
  _contact_id   uuid;
  _company_id   uuid;
  _addr_id      uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find existing contact → company for this user
  SELECT id, company_id
  INTO _contact_id, _company_id
  FROM public.contacts
  WHERE user_id = _uid
  LIMIT 1;

  IF _company_id IS NOT NULL THEN
    -- ── Update existing company ──────────────────────────────────────────────
    UPDATE public.companies SET
      name                    = COALESCE(_company_name, name),
      legal_company_name      = COALESCE(_legal_company_name, legal_company_name),
      vat_number              = COALESCE(_vat_number, vat_number),
      siret                   = COALESCE(_siret, siret),
      email                   = COALESCE(_email, email),
      phone                   = COALESCE(_phone, phone),
      preferred_delivery_days = COALESCE(_preferred_delivery_days, preferred_delivery_days),
      delivery_time_window    = COALESCE(_delivery_time_window, delivery_time_window),
      delivery_instructions   = COALESCE(_delivery_instructions, delivery_instructions),
      coffee_type             = COALESCE(_coffee_type, coffee_type),
      estimated_weekly_volume = COALESCE(_estimated_weekly_volume, estimated_weekly_volume),
      grinder_type            = COALESCE(_grinder_type, grinder_type),
      notes                   = COALESCE(_notes, notes),
      current_step            = COALESCE(_current_step, current_step),
      onboarding_status       = COALESCE(_onboarding_status, onboarding_status),
      updated_at              = now()
    WHERE id = _company_id;

    -- Update contact email/phone
    UPDATE public.contacts SET
      email      = COALESCE(_email, email),
      phone      = COALESCE(_phone, phone),
      updated_at = now()
    WHERE id = _contact_id;

    -- Upsert delivery address
    IF _delivery_address IS NOT NULL THEN
      SELECT id INTO _addr_id
      FROM public.company_addresses
      WHERE company_id = _company_id AND label = 'Delivery'
      LIMIT 1;

      IF _addr_id IS NOT NULL THEN
        UPDATE public.company_addresses SET
          address_line1 = _delivery_address,
          address_line2 = _delivery_instructions
        WHERE id = _addr_id;
      ELSE
        INSERT INTO public.company_addresses (company_id, label, address_line1, address_line2)
        VALUES (_company_id, 'Delivery', _delivery_address, _delivery_instructions);
      END IF;
    END IF;

  ELSE
    -- ── Create new company + contact ─────────────────────────────────────────
    INSERT INTO public.companies (
      name, legal_company_name, vat_number, siret,
      email, phone, preferred_delivery_days, delivery_time_window,
      delivery_instructions, coffee_type, estimated_weekly_volume,
      grinder_type, notes, current_step, onboarding_status, client_data_mode
    ) VALUES (
      COALESCE(_company_name, 'My Company'),
      _legal_company_name, _vat_number, _siret,
      _email, _phone, _preferred_delivery_days, _delivery_time_window,
      _delivery_instructions, _coffee_type, _estimated_weekly_volume,
      _grinder_type, _notes,
      COALESCE(_current_step, 1),
      COALESCE(_onboarding_status, 'pending'),
      'custom'
    )
    RETURNING id INTO _company_id;

    -- Create delivery address if provided
    IF _delivery_address IS NOT NULL THEN
      INSERT INTO public.company_addresses (company_id, label, address_line1, address_line2)
      VALUES (_company_id, 'Delivery', _delivery_address, _delivery_instructions);
    END IF;

    -- Create primary contact linked to this auth user
    INSERT INTO public.contacts (company_id, user_id, last_name, email, phone, is_primary)
    VALUES (
      _company_id,
      _uid,
      COALESCE(_contact_name, _company_name, _email, 'Contact'),
      _email,
      _phone,
      true
    )
    RETURNING id INTO _contact_id;
  END IF;

  RETURN jsonb_build_object('company_id', _company_id, 'contact_id', _contact_id);
END;
$$;
