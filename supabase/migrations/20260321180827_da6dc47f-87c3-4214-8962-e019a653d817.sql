
-- Create order status history table
CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all status history" ON public.order_status_history
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert status history" ON public.order_status_history
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can read own order status history" ON public.order_status_history
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_status_history.order_id AND orders.user_id = auth.uid())
  );

-- Add checklist columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_roasted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_packed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_labeled boolean NOT NULL DEFAULT false;

-- Update default status from 'draft' to 'received'
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'received';

-- Migrate existing draft orders to received
UPDATE public.orders SET status = 'received' WHERE status = 'draft';

-- Allow users to insert status history for their own orders (when placing)
CREATE POLICY "Users can insert own order status history" ON public.order_status_history
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_status_history.order_id AND orders.user_id = auth.uid())
  );

-- Create index for fast lookups
CREATE INDEX idx_order_status_history_order_id ON public.order_status_history(order_id);
CREATE INDEX idx_orders_status ON public.orders(status);
