-- Allow service-role inserts from the shopify-webhook edge function,
-- which has no internal user_id or changed_by actor.
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.order_status_history ALTER COLUMN changed_by DROP NOT NULL;
