CREATE OR REPLACE FUNCTION public.user_shares_ensemble_with_student(_user_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ensemble_students es
    JOIN public.ensemble_staff est ON est.ensemble_id = es.ensemble_id
    WHERE es.student_id = _student_id
      AND est.teacher_id = public.get_teacher_id_for_user(_user_id)
  )
$$;

CREATE POLICY "Ensemble staff can view enrollments of their ensemble students"
ON public.enrollments
FOR SELECT
TO authenticated
USING (public.user_shares_ensemble_with_student(auth.uid(), student_id));