CREATE POLICY "Coordinators manage their branch schedule"
ON public.branch_schedule_slots FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.branch_coordinators bc
    JOIN public.teachers t ON t.id = bc.teacher_id
    WHERE t.user_id = auth.uid()
      AND bc.school_id = branch_schedule_slots.school_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.branch_coordinators bc
    JOIN public.teachers t ON t.id = bc.teacher_id
    WHERE t.user_id = auth.uid()
      AND bc.school_id = branch_schedule_slots.school_id
  )
);