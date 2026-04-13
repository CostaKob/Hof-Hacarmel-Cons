CREATE POLICY "Anon can select registration by token"
ON public.registrations
FOR SELECT
TO anon
USING (registration_token IS NOT NULL AND registration_token != '');