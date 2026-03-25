
-- Add new role values to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'roaster';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'packaging';
