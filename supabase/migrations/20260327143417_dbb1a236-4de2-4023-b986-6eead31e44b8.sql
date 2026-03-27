CREATE POLICY "Admins can insert clients"
ON public.client_onboarding
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));