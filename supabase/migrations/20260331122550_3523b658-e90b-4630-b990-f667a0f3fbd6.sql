CREATE POLICY "Teachers can view all teachers"
ON public.teachers
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'teacher'::app_role));