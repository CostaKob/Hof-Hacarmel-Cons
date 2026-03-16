
ALTER TABLE public.school_music_schools
  ADD COLUMN classes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN day_of_week smallint NULL,
  ADD COLUMN class_schedules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN homeroom_teachers jsonb NOT NULL DEFAULT '[]'::jsonb;
