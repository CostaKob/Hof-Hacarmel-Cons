ALTER TABLE public.ensemble_students
  ADD COLUMN enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ensemble_students_enrollment_id
  ON public.ensemble_students(enrollment_id);

-- Backfill: pick earliest matching enrollment per (student, ensemble.year)
WITH picks AS (
  SELECT DISTINCT ON (es.id)
    es.id AS es_id,
    e.id AS enr_id
  FROM public.ensemble_students es
  JOIN public.ensembles en ON en.id = es.ensemble_id
  JOIN public.enrollments e
    ON e.student_id = es.student_id
   AND e.academic_year_id = en.academic_year_id
  ORDER BY es.id, e.start_date ASC, e.created_at ASC
)
UPDATE public.ensemble_students es
SET enrollment_id = picks.enr_id
FROM picks
WHERE es.id = picks.es_id;

ALTER TABLE public.ensemble_students
  DROP CONSTRAINT IF EXISTS ensemble_students_ensemble_id_student_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS ensemble_students_ensemble_enrollment_unique
  ON public.ensemble_students(ensemble_id, enrollment_id)
  WHERE enrollment_id IS NOT NULL;