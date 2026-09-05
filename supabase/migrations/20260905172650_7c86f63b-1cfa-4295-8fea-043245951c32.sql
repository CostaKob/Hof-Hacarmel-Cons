ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS schedule_start_minutes integer NOT NULL DEFAULT 480,
  ADD COLUMN IF NOT EXISTS schedule_end_minutes integer NOT NULL DEFAULT 1020;

UPDATE public.schools SET schedule_end_minutes = 1320 WHERE name ILIKE '%כרם%מהר%';