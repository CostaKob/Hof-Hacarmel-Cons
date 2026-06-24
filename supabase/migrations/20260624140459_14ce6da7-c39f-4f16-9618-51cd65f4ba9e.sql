ALTER TABLE public.instrument_loans DROP CONSTRAINT instrument_loans_school_music_student_id_fkey;
ALTER TABLE public.instrument_loans ADD CONSTRAINT instrument_loans_school_music_student_id_fkey FOREIGN KEY (school_music_student_id) REFERENCES public.school_music_students(id) ON DELETE CASCADE;

ALTER TABLE public.instrument_loans DROP CONSTRAINT instrument_loans_student_id_fkey;
ALTER TABLE public.instrument_loans ADD CONSTRAINT instrument_loans_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;