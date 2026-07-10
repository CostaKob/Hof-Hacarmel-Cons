
-- ensemble_students: only teachers assigned to that ensemble
DROP POLICY IF EXISTS "Teachers can view ensemble_students" ON public.ensemble_students;
CREATE POLICY "Teachers can view ensemble_students for their ensembles"
ON public.ensemble_students FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.ensemble_staff es
    WHERE es.ensemble_id = ensemble_students.ensemble_id
      AND es.teacher_id = get_teacher_id_for_user(auth.uid())
  )
);

-- school_music_groups: only own groups
DROP POLICY IF EXISTS "Teachers can view school_music_groups" ON public.school_music_groups;
CREATE POLICY "Teachers can view their own school_music_groups"
ON public.school_music_groups FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'teacher'::app_role)
  AND teacher_id = get_teacher_id_for_user(auth.uid())
);

-- inventory_instruments: teachers only see items currently/previously loaned to their own students
DROP POLICY IF EXISTS "Teachers can view inventory_instruments" ON public.inventory_instruments;
CREATE POLICY "Teachers can view inventory_instruments for their students"
ON public.inventory_instruments FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.instrument_loans l
    JOIN public.enrollments e ON e.student_id = l.student_id
    WHERE l.inventory_instrument_id = inventory_instruments.id
      AND e.teacher_id = get_teacher_id_for_user(auth.uid())
  )
);

-- instrument_repairs: teachers only see repairs for instruments loaned to their students
DROP POLICY IF EXISTS "Teachers can view instrument_repairs" ON public.instrument_repairs;
CREATE POLICY "Teachers can view instrument_repairs for their students"
ON public.instrument_repairs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.instrument_loans l
    JOIN public.enrollments e ON e.student_id = l.student_id
    WHERE l.inventory_instrument_id = instrument_repairs.inventory_instrument_id
      AND e.teacher_id = get_teacher_id_for_user(auth.uid())
  )
);
