create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sellsy_id text not null unique,
  sku text,
  name text not null,
  description text,
  origin text,
  roast_level text,
  price_per_kg numeric(10,2) not null default 0,
  is_active boolean not null default true,
  synced_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index products_sellsy_id_idx on public.products (sellsy_id);
create index products_is_active_idx on public.products (is_active);

alter table public.products enable row level security;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_products_updated_at
before update on public.products
for each row
execute function public.update_updated_at_column();

create policy "Authenticated users can read products"
on public.products
for select
to authenticated
using (true);

create policy "Admins can insert products"
on public.products
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update products"
on public.products
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete products"
on public.products
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can read user roles"
on public.user_roles
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert user roles"
on public.user_roles
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update user roles"
on public.user_roles
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete user roles"
on public.user_roles
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'));