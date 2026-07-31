CREATE TABLE public.family_dup_dismissals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_a_national_id text NOT NULL,
  parent_b_national_id text NOT NULL,
  dismissed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_dup_pair_order CHECK (parent_a_national_id < parent_b_national_id),
  CONSTRAINT family_dup_pair_unique UNIQUE (parent_a_national_id, parent_b_national_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_dup_dismissals TO authenticated;
GRANT ALL ON public.family_dup_dismissals TO service_role;

ALTER TABLE public.family_dup_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and secretaries manage family dup dismissals"
ON public.family_dup_dismissals FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));