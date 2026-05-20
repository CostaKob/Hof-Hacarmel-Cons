ALTER TABLE public.school_music_schools ADD COLUMN IF NOT EXISTS slug text;
DROP INDEX IF EXISTS school_music_schools_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS school_music_schools_slug_year_key ON public.school_music_schools (academic_year_id, slug) WHERE slug IS NOT NULL;

UPDATE public.school_music_schools SET slug = 'HaOmer' WHERE school_name = 'העמר' AND slug IS NULL;
UPDATE public.school_music_schools SET slug = 'CarmelVaYam' WHERE school_name = 'כרמל וים' AND slug IS NULL;
UPDATE public.school_music_schools SET slug = 'Maaganim' WHERE school_name = 'מעגנים' AND slug IS NULL;
UPDATE public.school_music_schools SET slug = 'Sitrin' WHERE school_name = 'סיטרין בנות' AND slug IS NULL;
UPDATE public.school_music_schools SET slug = 'Caesarea' WHERE school_name = 'קיסריה' AND slug IS NULL;