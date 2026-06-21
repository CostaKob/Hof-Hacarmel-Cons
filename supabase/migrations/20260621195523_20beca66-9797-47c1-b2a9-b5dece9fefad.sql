ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS music_production_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recital_track_price numeric NOT NULL DEFAULT 0;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS has_music_production_course boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_recital_track boolean NOT NULL DEFAULT false;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS wants_music_production boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wants_recital_track boolean NOT NULL DEFAULT false;