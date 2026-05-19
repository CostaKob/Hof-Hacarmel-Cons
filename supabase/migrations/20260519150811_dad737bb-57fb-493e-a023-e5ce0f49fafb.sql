
ALTER TABLE public.school_music_students DROP CONSTRAINT IF EXISTS school_music_students_school_fk;
ALTER TABLE public.school_music_students DROP CONSTRAINT IF EXISTS school_music_students_class_fk;
ALTER TABLE public.school_music_students DROP CONSTRAINT IF EXISTS school_music_students_group_fk;
ALTER TABLE public.school_music_students DROP CONSTRAINT IF EXISTS school_music_students_instrument_fk;
ALTER TABLE public.school_music_students DROP CONSTRAINT IF EXISTS school_music_students_year_fk;
ALTER TABLE public.school_music_payments DROP CONSTRAINT IF EXISTS school_music_payments_refund_fk;
