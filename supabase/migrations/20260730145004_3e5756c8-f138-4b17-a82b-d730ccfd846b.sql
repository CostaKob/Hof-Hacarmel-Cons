CREATE OR REPLACE FUNCTION public.is_sm_coordinator_any(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_music_schools s
    WHERE s.coordinator_teacher_id = public.get_teacher_id_for_user(_user_id)
      AND s.is_active = true
  );
$$;

CREATE POLICY "School music coordinators can view active teachers"
ON public.teachers
FOR SELECT
TO authenticated
USING (is_active = true AND public.is_sm_coordinator_any(auth.uid()));