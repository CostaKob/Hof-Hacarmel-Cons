-- 1. Add total_lessons_allocated column
ALTER TABLE public.enrollments
ADD COLUMN IF NOT EXISTS total_lessons_allocated integer NOT NULL DEFAULT 30;

-- 2. Fix the one NULL academic_year_id
UPDATE public.enrollments
SET academic_year_id = (SELECT id FROM public.academic_years WHERE is_active = true LIMIT 1)
WHERE academic_year_id IS NULL;

-- 3. Make academic_year_id NOT NULL
ALTER TABLE public.enrollments
ALTER COLUMN academic_year_id SET NOT NULL;

-- 4. Set default for new enrollments to active year
-- (We'll handle this in application code instead of a DB default since it's dynamic)