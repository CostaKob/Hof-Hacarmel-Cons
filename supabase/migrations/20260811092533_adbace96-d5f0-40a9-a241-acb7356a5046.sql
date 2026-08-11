-- Backfill student_id on payments so they never lose their owner
UPDATE public.student_payments p
SET student_id = e.student_id
FROM public.enrollments e
WHERE p.student_id IS NULL AND p.enrollment_id = e.id;

ALTER TABLE public.student_payments
  DROP CONSTRAINT student_payments_enrollment_id_fkey,
  ADD CONSTRAINT student_payments_enrollment_id_fkey
    FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE SET NULL;

ALTER TABLE public.ensemble_students
  DROP CONSTRAINT ensemble_students_enrollment_id_fkey,
  ADD CONSTRAINT ensemble_students_enrollment_id_fkey
    FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE SET NULL;