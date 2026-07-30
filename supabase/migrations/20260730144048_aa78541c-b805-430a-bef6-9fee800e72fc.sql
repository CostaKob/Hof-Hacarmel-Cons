ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS homeroom_teacher_name text,
  ADD COLUMN IF NOT EXISTS homeroom_teacher_phone text,
  ADD COLUMN IF NOT EXISTS homeroom_class text;

CREATE OR REPLACE FUNCTION public.set_student_homeroom(
  _student_id uuid,
  _name text,
  _phone text,
  _class text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allowed boolean;
BEGIN
  SELECT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'secretary')
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = _student_id
        AND e.teacher_id = public.get_teacher_id_for_user(auth.uid())
    )
  ) INTO _allowed;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'אין הרשאה לעדכן פרטי מחנכת עבור תלמיד זה';
  END IF;

  UPDATE public.students
  SET homeroom_teacher_name = NULLIF(TRIM(COALESCE(_name, '')), ''),
      homeroom_teacher_phone = NULLIF(TRIM(COALESCE(_phone, '')), ''),
      homeroom_class = NULLIF(TRIM(COALESCE(_class, '')), '')
  WHERE id = _student_id;
END;
$$;