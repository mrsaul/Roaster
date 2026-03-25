CREATE OR REPLACE FUNCTION public.ensure_current_user_role()
 RETURNS app_role
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has an active role assigned
  SELECT role INTO existing_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF existing_role IS NOT NULL THEN
    -- Update status to active if it was invited
    UPDATE public.user_roles
    SET status = 'active'
    WHERE user_id = auth.uid() AND status = 'invited';
    
    RETURN existing_role;
  END IF;

  -- New users always start as 'user'. Admins must be assigned via the Team panel.
  INSERT INTO public.user_roles (user_id, role, status)
  VALUES (auth.uid(), 'user'::public.app_role, 'active')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN 'user'::public.app_role;
END;
$function$;