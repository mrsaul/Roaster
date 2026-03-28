CREATE POLICY "Admins can insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert order items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));