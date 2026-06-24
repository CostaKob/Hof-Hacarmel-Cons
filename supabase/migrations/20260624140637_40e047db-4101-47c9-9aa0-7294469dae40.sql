CREATE OR REPLACE FUNCTION public.prevent_delete_school_music_student_with_active_loan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.instrument_loans
    WHERE school_music_student_id = OLD.id
      AND return_date IS NULL
  ) THEN
    RAISE EXCEPTION 'לא ניתן למחוק תלמיד עם כלי נגינה פעיל. יש להחזיר את הכלי לפני המחיקה.'
      USING ERRCODE = '23514';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_delete_school_music_student_with_active_loan_trigger
ON public.school_music_students;

CREATE TRIGGER prevent_delete_school_music_student_with_active_loan_trigger
BEFORE DELETE ON public.school_music_students
FOR EACH ROW
EXECUTE FUNCTION public.prevent_delete_school_music_student_with_active_loan();