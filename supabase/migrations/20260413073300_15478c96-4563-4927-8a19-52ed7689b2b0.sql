
-- 1. Add grade column to enrollments
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS grade text;

-- 2. Backfill grade from students
UPDATE public.enrollments e
SET grade = s.grade
FROM public.students s
WHERE e.student_id = s.id AND e.grade IS NULL;

-- 3. Backfill NULL academic_year_id in reports
UPDATE public.reports
SET academic_year_id = '622020b0-70e2-4af0-a7eb-5649f395026f'
WHERE academic_year_id IS NULL;

-- 4. NOT NULL constraints
ALTER TABLE public.reports ALTER COLUMN academic_year_id SET NOT NULL;
ALTER TABLE public.ensembles ALTER COLUMN academic_year_id SET NOT NULL;
ALTER TABLE public.school_music_schools ALTER COLUMN academic_year_id SET NOT NULL;
ALTER TABLE public.school_music_students ALTER COLUMN academic_year_id SET NOT NULL;

-- 5. Unique constraint
ALTER TABLE public.enrollments
ADD CONSTRAINT enrollments_student_instrument_year_unique
UNIQUE (student_id, instrument_id, academic_year_id);
