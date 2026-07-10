
CREATE TABLE public.student_payment_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  selected_discount_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  custom_discounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_date_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_payment_drafts TO authenticated;
GRANT ALL ON public.student_payment_drafts TO service_role;

ALTER TABLE public.student_payment_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and secretary manage payment drafts"
ON public.student_payment_drafts
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE INDEX idx_student_payment_drafts_year ON public.student_payment_drafts (academic_year_id);

CREATE TRIGGER student_payment_drafts_touch_updated_at
BEFORE UPDATE ON public.student_payment_drafts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();
