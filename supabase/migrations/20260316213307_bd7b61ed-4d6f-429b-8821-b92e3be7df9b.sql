
CREATE TABLE public.salary_manual_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  month_key text NOT NULL, -- format: "YYYY-MM"
  activity_days numeric NOT NULL DEFAULT 0,
  single_hours numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, month_key)
);

ALTER TABLE public.salary_manual_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage salary_manual_entries"
  ON public.salary_manual_entries FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
