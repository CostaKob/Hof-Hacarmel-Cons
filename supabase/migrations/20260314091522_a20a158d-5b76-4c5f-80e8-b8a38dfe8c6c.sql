
-- Change enrollments.teacher_id from CASCADE to RESTRICT
ALTER TABLE public.enrollments DROP CONSTRAINT enrollments_teacher_id_fkey;
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE RESTRICT;

-- Change reports.teacher_id from CASCADE to RESTRICT
ALTER TABLE public.reports DROP CONSTRAINT reports_teacher_id_fkey;
ALTER TABLE public.reports ADD CONSTRAINT reports_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE RESTRICT;

-- Keep CASCADE for teacher_instruments and teacher_schools (safe to delete with teacher)
