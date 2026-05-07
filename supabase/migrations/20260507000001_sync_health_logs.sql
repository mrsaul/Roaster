-- ── sync_health_logs ─────────────────────────────────────────────────────────
-- Stores results from the api-health-check edge function.
-- Each row captures the overall + per-integration status at a point in time.

create table if not exists public.sync_health_logs (
  id            uuid primary key default gen_random_uuid(),
  checked_at    timestamptz not null default now(),
  overall_status text not null check (overall_status in ('healthy', 'degraded', 'down')),
  sellsy_status  text not null check (sellsy_status in ('ok', 'degraded', 'down')),
  shopify_status text not null check (shopify_status in ('ok', 'degraded', 'down')),
  google_sheets_status text not null check (google_sheets_status in ('ok', 'degraded', 'down')),
  supabase_status text not null check (supabase_status in ('ok', 'degraded', 'down')),
  details        jsonb,
  triggered_by   uuid
);

-- Index for time-range queries (most common access pattern)
create index if not exists sync_health_logs_checked_at_idx
  on public.sync_health_logs (checked_at desc);

-- RLS: only admins can read/insert
alter table public.sync_health_logs enable row level security;

create policy "Admins can read health logs"
  on public.sync_health_logs for select
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can insert health logs"
  on public.sync_health_logs for insert
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- ── Missing indexes from DB audit ─────────────────────────────────────────────
-- Fix the 9 missing FK/lookup column indexes identified in the relationship audit.

create index if not exists orders_user_id_idx
  on public.orders (user_id);

create index if not exists orders_sellsy_id_idx
  on public.orders (sellsy_id);

create index if not exists client_onboarding_user_id_idx
  on public.client_onboarding (user_id);

create index if not exists user_roles_user_id_idx
  on public.user_roles (user_id);

create index if not exists sync_runs_created_by_idx
  on public.sync_runs (created_by);

create index if not exists products_sellsy_id_idx
  on public.products (sellsy_id);

create index if not exists products_sku_idx
  on public.products (sku);

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create index if not exists order_items_product_id_idx
  on public.order_items (product_id);
