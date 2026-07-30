CREATE TABLE public.broadcast_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject text NOT NULL,
  body_html text NOT NULL,
  audience text,
  audience_label text,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  recipients_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_by uuid,
  sent_by_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_messages TO authenticated;
GRANT ALL ON public.broadcast_messages TO service_role;

ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view broadcast archive"
ON public.broadcast_messages FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Staff can add broadcast archive"
ON public.broadcast_messages FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Admins can delete broadcast archive"
ON public.broadcast_messages FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_broadcast_messages_created_at ON public.broadcast_messages (created_at DESC);