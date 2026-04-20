-- Add notes and confirmed_at to orders
alter table orders
  add column if not exists notes text,
  add column if not exists confirmed_at timestamptz;
