
-- Reset academic year תשפ״ז: delete all linked data so the year can be deleted
DO $$
DECLARE
  _year_id uuid := 'b3ec45c5-d806-42b3-a975-d9235a17c5da';
BEGIN
  -- Report lines via reports
  DELETE FROM public.report_lines WHERE report_id IN (SELECT id FROM public.reports WHERE academic_year_id = _year_id);
  DELETE FROM public.reports WHERE academic_year_id = _year_id;

  -- Student payments
  DELETE FROM public.student_payments WHERE academic_year_id = _year_id;

  -- Enrollments
  DELETE FROM public.enrollments WHERE academic_year_id = _year_id;

  -- Ensembles cascade
  DELETE FROM public.ensemble_students WHERE ensemble_id IN (SELECT id FROM public.ensembles WHERE academic_year_id = _year_id);
  DELETE FROM public.ensemble_staff WHERE ensemble_id IN (SELECT id FROM public.ensembles WHERE academic_year_id = _year_id);
  DELETE FROM public.ensembles WHERE academic_year_id = _year_id;

  -- School music cascade
  DELETE FROM public.school_music_payments WHERE academic_year_id = _year_id;
  DELETE FROM public.school_music_students WHERE academic_year_id = _year_id;
  DELETE FROM public.school_music_session_groups WHERE school_music_session_id IN (
    SELECT id FROM public.school_music_sessions WHERE school_music_school_id IN (
      SELECT id FROM public.school_music_schools WHERE academic_year_id = _year_id
    )
  );
  DELETE FROM public.school_music_sessions WHERE school_music_school_id IN (
    SELECT id FROM public.school_music_schools WHERE academic_year_id = _year_id
  );
  DELETE FROM public.school_music_class_groups WHERE school_music_class_id IN (
    SELECT id FROM public.school_music_classes WHERE school_music_school_id IN (
      SELECT id FROM public.school_music_schools WHERE academic_year_id = _year_id
    )
  );
  DELETE FROM public.school_music_classes WHERE school_music_school_id IN (
    SELECT id FROM public.school_music_schools WHERE academic_year_id = _year_id
  );
  DELETE FROM public.school_music_groups WHERE school_music_school_id IN (
    SELECT id FROM public.school_music_schools WHERE academic_year_id = _year_id
  );
  DELETE FROM public.school_music_schools WHERE academic_year_id = _year_id;

  -- Branch coordinators
  DELETE FROM public.branch_coordinators WHERE academic_year_id = _year_id;

  -- Registrations
  DELETE FROM public.registrations WHERE academic_year_id = _year_id;

  -- Registration pages cascade
  DELETE FROM public.registration_page_fields WHERE page_id IN (SELECT id FROM public.registration_pages WHERE academic_year_id = _year_id);
  DELETE FROM public.registration_page_sections WHERE page_id IN (SELECT id FROM public.registration_pages WHERE academic_year_id = _year_id);
  DELETE FROM public.registration_pages WHERE academic_year_id = _year_id;
  DELETE FROM public.registration_form_settings WHERE academic_year_id = _year_id;
END $$;
