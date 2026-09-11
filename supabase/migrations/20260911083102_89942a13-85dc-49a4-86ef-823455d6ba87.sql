CREATE POLICY "Teachers can view students in their ensembles"
ON public.students
FOR SELECT
TO authenticated
USING (public.user_shares_ensemble_with_student(auth.uid(), id));