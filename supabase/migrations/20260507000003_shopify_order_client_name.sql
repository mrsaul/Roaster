-- ── Shopify order client name + nullable product_id ──────────────────────────

-- 1. Add client_name to orders (for Shopify orders where user_id is null)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_name text;

-- 2. Make product_id nullable in order_items so unmatched Shopify line items
--    can still be stored with their Shopify title, price, and quantity
ALTER TABLE public.order_items
  ALTER COLUMN product_id DROP NOT NULL;

-- 3. Backfill client_name from shopify_orders for existing Shopify-originated orders
UPDATE public.orders o
SET client_name = so.customer_name
FROM public.shopify_orders so
WHERE so.synced_to_order_id = o.id
  AND so.customer_name IS NOT NULL
  AND o.client_name IS NULL;

-- 4. Backfill order_items from shopify_orders.line_items for orders that have no items
INSERT INTO public.order_items (
  order_id, product_id, product_name, product_sku,
  quantity, price_per_kg, size_label, size_kg
)
SELECT
  o.id                                         AS order_id,
  NULL                                         AS product_id,
  (item->>'title')                             AS product_name,
  NULLIF(item->>'sku', '')                     AS product_sku,
  CASE
    WHEN (item->>'grams')::int > 0
    THEN ((item->>'grams')::numeric / 1000) * (item->>'quantity')::numeric
    ELSE (item->>'quantity')::numeric
  END                                          AS quantity,
  CASE
    WHEN ((item->>'grams')::int > 0)
         AND (((item->>'grams')::numeric / 1000) * (item->>'quantity')::numeric) > 0
    THEN ROUND(
      (item->>'price')::numeric /
      (((item->>'grams')::numeric / 1000) * (item->>'quantity')::numeric),
      2
    )
    ELSE (item->>'price')::numeric
  END                                          AS price_per_kg,
  item->>'variant_title'                       AS size_label,
  CASE
    WHEN (item->>'grams')::int > 0
    THEN ((item->>'grams')::numeric / 1000) * (item->>'quantity')::numeric
    ELSE NULL
  END                                          AS size_kg
FROM public.orders o
JOIN public.shopify_orders so ON so.synced_to_order_id = o.id
CROSS JOIN LATERAL jsonb_array_elements(so.line_items::jsonb) AS item
WHERE NOT EXISTS (
  SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id
)
  AND so.line_items IS NOT NULL
  AND jsonb_typeof(so.line_items::jsonb) = 'array';

-- 5. Fix total_kg = 0 for orders whose items were just backfilled
UPDATE public.orders o
SET total_kg = sub.total_kg
FROM (
  SELECT order_id, SUM(quantity) AS total_kg
  FROM public.order_items
  GROUP BY order_id
) sub
WHERE sub.order_id = o.id
  AND o.total_kg = 0
  AND sub.total_kg > 0;
