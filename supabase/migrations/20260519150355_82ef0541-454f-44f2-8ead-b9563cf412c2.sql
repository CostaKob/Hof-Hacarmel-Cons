ALTER TABLE public.school_music_payments
  ADD CONSTRAINT school_music_payments_student_fk FOREIGN KEY (school_music_student_id) REFERENCES public.school_music_students(id) ON DELETE CASCADE,
  ADD CONSTRAINT school_music_payments_school_fk FOREIGN KEY (school_music_school_id) REFERENCES public.school_music_schools(id) ON DELETE CASCADE,
  ADD CONSTRAINT school_music_payments_year_fk FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  ADD CONSTRAINT school_music_payments_refund_fk FOREIGN KEY (refund_of_payment_id) REFERENCES public.school_music_payments(id) ON DELETE SET NULL;

ALTER TABLE public.school_music_students
  ADD CONSTRAINT school_music_students_school_fk FOREIGN KEY (school_music_school_id) REFERENCES public.school_music_schools(id) ON DELETE CASCADE,
  ADD CONSTRAINT school_music_students_class_fk FOREIGN KEY (school_music_class_id) REFERENCES public.school_music_classes(id) ON DELETE SET NULL,
  ADD CONSTRAINT school_music_students_group_fk FOREIGN KEY (school_music_class_group_id) REFERENCES public.school_music_class_groups(id) ON DELETE SET NULL,
  ADD CONSTRAINT school_music_students_instrument_fk FOREIGN KEY (instrument_id) REFERENCES public.instruments(id) ON DELETE SET NULL,
  ADD CONSTRAINT school_music_students_year_fk FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_smp_student ON public.school_music_payments(school_music_student_id);
CREATE INDEX IF NOT EXISTS idx_smp_school ON public.school_music_payments(school_music_school_id);
CREATE INDEX IF NOT EXISTS idx_smp_year ON public.school_music_payments(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_sms_school ON public.school_music_students(school_music_school_id);