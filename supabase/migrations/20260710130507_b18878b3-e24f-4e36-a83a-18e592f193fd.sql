DROP POLICY "Teachers can view school_music_class_groups" ON public.school_music_class_groups;
CREATE POLICY "Teachers can view school_music_class_groups"
ON public.school_music_class_groups
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role) AND (
    teacher_id = get_teacher_id_for_user(auth.uid())
    OR school_music_class_id IN (
      SELECT smc.id FROM school_music_classes smc
      WHERE smc.school_music_school_id IN (
        SELECT sms.id FROM school_music_schools sms
        WHERE sms.coordinator_teacher_id = get_teacher_id_for_user(auth.uid())
          OR sms.conductor_teacher_id = get_teacher_id_for_user(auth.uid())
          OR sms.id IN (SELECT smg.school_music_school_id FROM school_music_groups smg WHERE smg.teacher_id = get_teacher_id_for_user(auth.uid()))
      )
    )
  )
);

DROP POLICY "Teachers can view school_music_classes" ON public.school_music_classes;
CREATE POLICY "Teachers can view school_music_classes"
ON public.school_music_classes
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role) AND (
    school_music_school_id IN (
      SELECT sms.id FROM school_music_schools sms
      WHERE sms.coordinator_teacher_id = get_teacher_id_for_user(auth.uid())
        OR sms.conductor_teacher_id = get_teacher_id_for_user(auth.uid())
        OR sms.id IN (SELECT smg.school_music_school_id FROM school_music_groups smg WHERE smg.teacher_id = get_teacher_id_for_user(auth.uid()))
    )
    OR id IN (
      SELECT cg.school_music_class_id FROM school_music_class_groups cg
      WHERE cg.teacher_id = get_teacher_id_for_user(auth.uid())
    )
  )
);