ALTER TABLE public.notification_reads ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Users can update their own notification reads" ON public.notification_reads;
CREATE POLICY "Users can update their own notification reads"
ON public.notification_reads
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_reads TO authenticated;

CREATE OR REPLACE FUNCTION public.create_notification(_type text, _title text, _body text, _link_path text, _entity_id uuid, _year_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (type, title, body, link_path, entity_id, academic_year_id)
  VALUES (_type, _title, _body, _link_path, _entity_id, _year_id);

  DELETE FROM public.notifications WHERE created_at < now() - interval '90 days';
END;
$$;