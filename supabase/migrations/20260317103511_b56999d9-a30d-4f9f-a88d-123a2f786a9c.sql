CREATE OR REPLACE FUNCTION public.ensure_current_user_role()
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_email text;
  assigned_role public.app_role;
BEGIN
  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  assigned_role := CASE
    WHEN current_email = 'contact@pluralcafe.fr' THEN 'admin'::public.app_role
    ELSE 'user'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), assigned_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF assigned_role = 'admin' THEN
    DELETE FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'user'::public.app_role;
  END IF;

  RETURN assigned_role;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_current_user_role() TO authenticated;

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);