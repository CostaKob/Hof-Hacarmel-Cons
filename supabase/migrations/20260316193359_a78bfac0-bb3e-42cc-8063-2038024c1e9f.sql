ALTER TABLE public.ensembles
  ADD COLUMN day_of_week smallint NULL,
  ADD COLUMN start_time time NULL,
  ADD COLUMN room text NULL;