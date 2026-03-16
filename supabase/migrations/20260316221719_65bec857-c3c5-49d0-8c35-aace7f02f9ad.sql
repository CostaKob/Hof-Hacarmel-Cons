CREATE TABLE public.branch_coordinators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  branch_name text NOT NULL,
  weekly_hours numeric NOT NULL DEFAULT 0,
  academic_year_id uuid REFERENCES public.academic_years(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.branch_coordinators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage branch_coordinators"
  ON public.branch_coordinators FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view own branch_coordinators"
  ON public.branch_coordinators FOR SELECT TO authenticated
  USING (teacher_id = get_teacher_id_for_user(auth.uid()));