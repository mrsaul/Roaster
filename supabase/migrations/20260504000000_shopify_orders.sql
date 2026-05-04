-- Stores raw Shopify payloads and links them to internal orders

create table if not exists shopify_orders (

  id                  uuid primary key default gen_random_uuid(),

  shopify_order_id    text unique not null,

  shopify_order_number text,

  customer_name       text,

  customer_email      text,

  line_items          jsonb not null default '[]',

  total_price         numeric(10,2),

  currency            text default 'EUR',

  financial_status    text,

  fulfillment_status  text,

  raw_payload         jsonb,

  synced_to_order_id  uuid references orders(id) on delete set null,

  created_at          timestamptz default now(),

  received_at         timestamptz default now()

);

alter table shopify_orders enable row level security;

-- Admins can read all Shopify orders
create policy "shopify_orders_select_admin"
  on shopify_orders for select
  using (has_role(auth.uid(), 'admin'));

-- Only service role can insert (from the webhook edge function)
create policy "shopify_orders_insert_service"
  on shopify_orders for insert
  with check (auth.role() = 'service_role');

-- Service role can update (to write synced_to_order_id back)
create policy "shopify_orders_update_service"
  on shopify_orders for update
  using (auth.role() = 'service_role');
