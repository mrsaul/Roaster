-- Fix 1: Drop redundant explicit indexes (UNIQUE constraint already creates implicit indexes)
DROP INDEX IF EXISTS public.companies_sellsy_id_idx;
DROP INDEX IF EXISTS public.contacts_sellsy_contact_id_idx;

-- Fix 2: Replace self-referential contacts peer policy with SECURITY DEFINER function
DROP POLICY IF EXISTS "Contacts can read company peers" ON public.contacts;

-- Create a SECURITY DEFINER function to safely get the current user's company_id
-- This runs with elevated privileges, bypassing RLS for the lookup
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.contacts
  WHERE user_id = auth.uid()
    AND company_id IS NOT NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated;

-- Re-create the policy using the safe function instead of self-join
CREATE POLICY "Contacts can read company peers" ON public.contacts FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = public.get_my_company_id()
  );
