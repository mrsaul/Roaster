
-- Client onboarding profiles table
CREATE TABLE public.client_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  
  -- Step 1: Business info
  company_name text,
  legal_company_name text,
  vat_number text,
  siret text,
  contact_name text,
  email text,
  phone text,
  
  -- Step 2: Delivery
  delivery_address text,
  delivery_instructions text,
  preferred_delivery_days text[] DEFAULT '{}',
  delivery_time_window text,
  
  -- Step 3: Ordering preferences
  coffee_type text, -- 'espresso', 'filter', 'both'
  estimated_weekly_volume numeric DEFAULT 0,
  grinder_type text,
  notes text,
  
  -- Step 4: Pricing
  pricing_tier text DEFAULT 'standard',
  payment_terms text DEFAULT '30 days',
  min_order_kg numeric DEFAULT 3,
  
  -- Status tracking
  current_step integer DEFAULT 1,
  onboarding_status text DEFAULT 'pending', -- 'pending', 'completed'
  sellsy_client_id text,
  
  -- Admin
  admin_notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_onboarding ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own onboarding
CREATE POLICY "Users can read own onboarding"
  ON public.client_onboarding FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own onboarding"
  ON public.client_onboarding FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own onboarding"
  ON public.client_onboarding FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins full access
CREATE POLICY "Admins can read all onboarding"
  ON public.client_onboarding FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all onboarding"
  ON public.client_onboarding FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_client_onboarding_updated_at
  BEFORE UPDATE ON public.client_onboarding
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
