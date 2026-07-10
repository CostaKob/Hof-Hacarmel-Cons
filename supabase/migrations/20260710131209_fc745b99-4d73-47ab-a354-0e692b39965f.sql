
CREATE OR REPLACE FUNCTION public.teacher_is_in_ensemble(_user_id uuid, _ensemble_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ensemble_staff es
    WHERE es.ensemble_id = _ensemble_id
      AND es.teacher_id = public.get_teacher_id_for_user(_user_id)
  );
$$;

DROP POLICY IF EXISTS "Teachers can view ensemble_staff for their ensembles" ON public.ensemble_staff;
CREATE POLICY "Teachers can view ensemble_staff for their ensembles"
ON public.ensemble_staff
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND public.teacher_is_in_ensemble(auth.uid(), ensemble_id)
);

DROP POLICY IF EXISTS "Teachers can view ensemble_students for their ensembles" ON public.ensemble_students;
CREATE POLICY "Teachers can view ensemble_students for their ensembles"
ON public.ensemble_students
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND public.teacher_is_in_ensemble(auth.uid(), ensemble_id)
);
