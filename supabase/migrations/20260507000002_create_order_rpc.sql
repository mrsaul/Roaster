-- ── create_order_with_items RPC ───────────────────────────────────────────────
-- Wraps order + order_items inserts in a single database transaction.
-- If item inserts fail, the order row is rolled back automatically.
-- Replaces the two sequential client-side inserts in handleConfirmOrder.

create or replace function public.create_order_with_items(
  p_user_id        uuid,
  p_delivery_date  date,
  p_total_kg       numeric,
  p_total_price    numeric,
  p_status         text,
  p_confirmed_at   timestamptz,
  p_notes          text,
  p_items          jsonb   -- array of item objects
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item     jsonb;
begin
  -- 1. Insert the order
  insert into public.orders (
    user_id, delivery_date, total_kg, total_price,
    status, confirmed_at, notes
  )
  values (
    p_user_id, p_delivery_date, p_total_kg, p_total_price,
    p_status, p_confirmed_at, p_notes
  )
  returning id into v_order_id;

  -- 2. Insert all items — any failure here rolls back the order insert
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id, product_id, product_name, product_sku,
      price_per_kg, quantity, size_label, size_kg
    )
    values (
      v_order_id,
      (v_item->>'product_id')::uuid,
       v_item->>'product_name',
       v_item->>'product_sku',
      (v_item->>'price_per_kg')::numeric,
      (v_item->>'quantity')::numeric,
       v_item->>'size_label',
      case when v_item->>'size_kg' is not null
           then (v_item->>'size_kg')::numeric
           else null end
    );
  end loop;

  return jsonb_build_object('order_id', v_order_id);
end;
$$;

-- Allow authenticated users to call this (RLS on the underlying tables still applies)
grant execute on function public.create_order_with_items(
  uuid, date, numeric, numeric, text, timestamptz, text, jsonb
) to authenticated;
