CREATE TABLE public.operations_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_log TO authenticated;
GRANT ALL ON public.operations_log TO service_role;

ALTER TABLE public.operations_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view operations log"
ON public.operations_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Authenticated can add operations log entries"
ON public.operations_log FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Owners can update operations log"
ON public.operations_log FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can delete operations log"
ON public.operations_log FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'owner'));

CREATE INDEX operations_log_occurred_at_idx ON public.operations_log (occurred_at DESC);