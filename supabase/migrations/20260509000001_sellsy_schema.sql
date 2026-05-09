-- ── companies ─────────────────────────────────────────────────────────────────
CREATE TABLE public.companies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellsy_id             TEXT UNIQUE,
  type                  TEXT,
  name                  TEXT NOT NULL,
  reference             TEXT,
  legal_form            TEXT,
  rate_category         TEXT,
  email                 TEXT,
  phone                 TEXT,
  mobile                TEXT,
  fax                   TEXT,
  website               TEXT,
  vat_number            TEXT,
  naf_code              TEXT,
  share_capital         TEXT,
  rcs                   TEXT,
  employee_count        TEXT,
  siret                 TEXT,
  siren                 TEXT,
  notes                 TEXT,
  smart_tags            TEXT[],
  owner                 TEXT,
  third_party_account   TEXT,
  auxiliary_account     TEXT,
  subscribed_email      BOOLEAN DEFAULT false,
  subscribed_sms        BOOLEAN DEFAULT false,
  subscribed_phone      BOOLEAN DEFAULT false,
  subscribed_mail       BOOLEAN DEFAULT false,
  subscribed_custom     BOOLEAN DEFAULT false,
  archived              BOOLEAN DEFAULT false,
  company_type          TEXT,
  sellsy_created_at     TIMESTAMPTZ,
  -- App-specific fields preserved from client_onboarding
  sellsy_client_id      TEXT,
  client_data_mode      TEXT NOT NULL DEFAULT 'custom',
  onboarding_status     TEXT,
  current_step          INTEGER,
  pricing_tier_id       UUID REFERENCES public.pricing_tiers(id),
  min_order_kg          NUMERIC,
  payment_terms         TEXT,
  preferred_delivery_days TEXT[],
  delivery_time_window  TEXT,
  delivery_instructions TEXT,
  coffee_type           TEXT,
  estimated_weekly_volume NUMERIC,
  grinder_type          TEXT,
  admin_notes           TEXT,
  last_synced_at        TIMESTAMPTZ,
  legal_company_name    TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX companies_sellsy_id_idx  ON public.companies (sellsy_id);
CREATE INDEX companies_name_idx       ON public.companies (name);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── company_addresses ─────────────────────────────────────────────────────────
CREATE TABLE public.company_addresses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sellsy_address_id     TEXT,
  label                 TEXT,
  address_line1         TEXT,
  address_line2         TEXT,
  address_line3         TEXT,
  address_line4         TEXT,
  postal_code           TEXT,
  city                  TEXT,
  state_province        TEXT,
  country_code          TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX company_addresses_company_id_idx ON public.company_addresses (company_id);

ALTER TABLE public.company_addresses ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_company_addresses_updated_at
  BEFORE UPDATE ON public.company_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── contacts ──────────────────────────────────────────────────────────────────
CREATE TABLE public.contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES auth.users(id),
  sellsy_contact_id     TEXT UNIQUE,
  civility              TEXT,
  is_primary            BOOLEAN DEFAULT false,
  is_billing            BOOLEAN DEFAULT false,
  is_dunning            BOOLEAN DEFAULT false,
  last_name             TEXT NOT NULL,
  first_name            TEXT,
  email                 TEXT,
  phone                 TEXT,
  mobile                TEXT,
  fax                   TEXT,
  website               TEXT,
  job_title             TEXT,
  smart_tags            TEXT[],
  notes                 TEXT,
  subscribed_email      BOOLEAN DEFAULT false,
  subscribed_sms        BOOLEAN DEFAULT false,
  subscribed_phone      BOOLEAN DEFAULT false,
  subscribed_mail       BOOLEAN DEFAULT false,
  subscribed_custom     BOOLEAN DEFAULT false,
  archived              BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX contacts_sellsy_contact_id_idx ON public.contacts (sellsy_contact_id);
CREATE INDEX contacts_email_idx             ON public.contacts (email);
CREATE INDEX contacts_company_id_idx        ON public.contacts (company_id);
CREATE INDEX contacts_user_id_idx           ON public.contacts (user_id);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS: companies ────────────────────────────────────────────────────────────
CREATE POLICY "Admins can select companies" ON public.companies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert companies" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update companies" ON public.companies FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete companies" ON public.companies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Contacts can read own company" ON public.companies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts
      WHERE contacts.company_id = companies.id
        AND contacts.user_id = auth.uid()
    )
  );

-- ── RLS: company_addresses ────────────────────────────────────────────────────
CREATE POLICY "Admins can select company_addresses" ON public.company_addresses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert company_addresses" ON public.company_addresses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update company_addresses" ON public.company_addresses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete company_addresses" ON public.company_addresses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Contacts can read own addresses" ON public.company_addresses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts
      WHERE contacts.company_id = company_addresses.company_id
        AND contacts.user_id = auth.uid()
    )
  );

-- ── RLS: contacts ─────────────────────────────────────────────────────────────
CREATE POLICY "Admins can select contacts" ON public.contacts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert contacts" ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update contacts" ON public.contacts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete contacts" ON public.contacts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Contacts can read own record" ON public.contacts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Contacts can read company peers" ON public.contacts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts AS me
      WHERE me.company_id = contacts.company_id
        AND me.user_id = auth.uid()
    )
  );

CREATE POLICY "Contacts can update own record" ON public.contacts FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
