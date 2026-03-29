
-- Create product_variants table for size-based pricing
CREATE TABLE public.product_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size_label TEXT NOT NULL, -- '250g', '1kg', '3kg'
  size_kg NUMERIC NOT NULL, -- 0.25, 1, 3
  price NUMERIC NOT NULL DEFAULT 0,
  sku TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, size_label)
);

-- Enable RLS
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read variants" ON public.product_variants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert variants" ON public.product_variants
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update variants" ON public.product_variants
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete variants" ON public.product_variants
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Add size columns to order_items
ALTER TABLE public.order_items ADD COLUMN size_label TEXT;
ALTER TABLE public.order_items ADD COLUMN size_kg NUMERIC;

-- Add updated_at trigger
CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
