
-- 1. Academic years table
CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage academic_years" ON public.academic_years
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view academic_years" ON public.academic_years
  FOR SELECT TO authenticated
  USING (true);

-- 2. Add grade and playing_level to students
ALTER TABLE public.students ADD COLUMN grade text;
ALTER TABLE public.students ADD COLUMN playing_level text;

-- 3. Add instrument_start_date to enrollments
ALTER TABLE public.enrollments ADD COLUMN instrument_start_date date;

-- 4. Add academic_year_id FK to enrollments, reports, student_payments
ALTER TABLE public.enrollments ADD COLUMN academic_year_id uuid REFERENCES public.academic_years(id);
ALTER TABLE public.reports ADD COLUMN academic_year_id uuid REFERENCES public.academic_years(id);
ALTER TABLE public.student_payments ADD COLUMN academic_year_id uuid REFERENCES public.academic_years(id);
