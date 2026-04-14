ALTER TABLE public.students
ADD COLUMN last_promoted_year_id uuid REFERENCES public.academic_years(id);