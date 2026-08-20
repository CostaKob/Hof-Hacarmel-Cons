CREATE TABLE public.school_music_graduate_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  is_graduate boolean NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_music_graduate_marks TO authenticated;
GRANT ALL ON public.school_music_graduate_marks TO service_role;

ALTER TABLE public.school_music_graduate_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and secretary manage sm graduate marks"
ON public.school_music_graduate_marks FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'secretary'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'secretary'::app_role));

CREATE TRIGGER trg_sm_graduate_marks_updated_at
BEFORE UPDATE ON public.school_music_graduate_marks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();