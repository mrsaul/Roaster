
-- Create pricing_tiers table
CREATE TABLE public.pricing_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  product_discount_percent NUMERIC NOT NULL DEFAULT 0,
  delivery_discount_percent NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add pricing_tier_id to client_onboarding
ALTER TABLE public.client_onboarding
  ADD COLUMN pricing_tier_id UUID REFERENCES public.pricing_tiers(id) ON DELETE SET NULL;

-- Add discount tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN discount_percent NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN delivery_discount_percent NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN pricing_tier_name TEXT;

-- Enable RLS on pricing_tiers
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read pricing tiers
CREATE POLICY "Authenticated users can read pricing tiers"
  ON public.pricing_tiers FOR SELECT TO authenticated
  USING (true);

-- Only admins can manage pricing tiers
CREATE POLICY "Admins can insert pricing tiers"
  ON public.pricing_tiers FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update pricing tiers"
  ON public.pricing_tiers FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete pricing tiers"
  ON public.pricing_tiers FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_pricing_tiers_updated_at
  BEFORE UPDATE ON public.pricing_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
