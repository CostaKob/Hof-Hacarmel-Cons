
-- Allow teachers to view school_music_schools where they are coordinator, conductor, or group teacher
CREATE POLICY "Teachers can view assigned school_music_schools"
ON public.school_music_schools
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND (
    coordinator_teacher_id = get_teacher_id_for_user(auth.uid())
    OR conductor_teacher_id = get_teacher_id_for_user(auth.uid())
    OR id IN (
      SELECT school_music_school_id FROM public.school_music_groups
      WHERE teacher_id = get_teacher_id_for_user(auth.uid())
    )
  )
);

-- Allow teachers to view school_music_groups for schools they have access to
CREATE POLICY "Teachers can view school_music_groups"
ON public.school_music_groups
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role)
);
