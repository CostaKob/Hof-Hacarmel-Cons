ALTER TABLE public.registration_pages
  ADD COLUMN IF NOT EXISTS special_courses_section_title text NOT NULL DEFAULT 'קורסים מיוחדים',
  ADD COLUMN IF NOT EXISTS special_courses_section_description text NOT NULL DEFAULT 'סמנו אם ברצונכם להירשם לקורסים מיוחדים בנוסף לשיעור הרגיל. המחיר יתווסף לחיוב השנתי.',
  ADD COLUMN IF NOT EXISTS music_production_title text NOT NULL DEFAULT 'קורס הפקה מוסיקלית',
  ADD COLUMN IF NOT EXISTS music_production_subtitle text NOT NULL DEFAULT 'מיועד לכיתות ז׳–י״ב בלבד',
  ADD COLUMN IF NOT EXISTS recital_track_title text NOT NULL DEFAULT 'מסלול לרסיטל',
  ADD COLUMN IF NOT EXISTS recital_track_subtitle text NOT NULL DEFAULT 'מיועד לכיתה י״ב בלבד';