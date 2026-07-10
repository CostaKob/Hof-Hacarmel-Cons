DROP POLICY "Teachers can view assigned school_music_schools" ON public.school_music_schools;

CREATE POLICY "Teachers can view assigned school_music_schools"
ON public.school_music_schools
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role) AND (
    coordinator_teacher_id = get_teacher_id_for_user(auth.uid())
    OR conductor_teacher_id = get_teacher_id_for_user(auth.uid())
    OR id IN (
      SELECT school_music_school_id FROM school_music_groups
      WHERE teacher_id = get_teacher_id_for_user(auth.uid())
    )
    OR id IN (
      SELECT c.school_music_school_id
      FROM school_music_class_groups cg
      JOIN school_music_classes c ON c.id = cg.school_music_class_id
      WHERE cg.teacher_id = get_teacher_id_for_user(auth.uid())
    )
  )
);