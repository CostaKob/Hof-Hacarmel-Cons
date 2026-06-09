
CREATE OR REPLACE FUNCTION public.discount_types_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.discount_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  label text NOT NULL,
  percentage numeric(5,2) NOT NULL DEFAULT 0,
  applies_to text NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all','cheapest_enrollment')),
  legacy_key text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX discount_types_year_idx ON public.discount_types(academic_year_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_types TO authenticated;
GRANT ALL ON public.discount_types TO service_role;

ALTER TABLE public.discount_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view discount types"
  ON public.discount_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Secretary manage discount types"
  ON public.discount_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE TRIGGER trg_discount_types_updated_at
  BEFORE UPDATE ON public.discount_types
  FOR EACH ROW EXECUTE FUNCTION public.discount_types_touch_updated_at();

INSERT INTO public.discount_types (academic_year_id, label, percentage, applies_to, legacy_key, sort_order)
SELECT id, 'אח שני', COALESCE(discount_sibling_pct, 0), 'all', 'sibling', 1 FROM public.academic_years
UNION ALL
SELECT id, 'כלי שני', COALESCE(discount_second_instrument_pct, 0), 'cheapest_enrollment', 'second_instrument', 2 FROM public.academic_years
UNION ALL
SELECT id, 'תלמיד מגמה', COALESCE(discount_major_student_pct, 0), 'all', 'major_student', 3 FROM public.academic_years;
