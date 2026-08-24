DO $$
DECLARE ids uuid[] := ARRAY['daac44ec-eab6-41b4-befe-eba0cb157cfa','5a012f21-361c-4deb-879d-a8dc25b80683']::uuid[];
BEGIN
  DELETE FROM public.report_lines WHERE enrollment_id IN (SELECT id FROM public.enrollments WHERE student_id = ANY(ids));
  DELETE FROM public.ensemble_students WHERE student_id = ANY(ids);
  DELETE FROM public.student_notes WHERE student_id = ANY(ids);
  DELETE FROM public.instrument_loans WHERE student_id = ANY(ids);
  DELETE FROM public.student_payments WHERE student_id = ANY(ids);
  DELETE FROM public.student_payment_drafts WHERE student_id = ANY(ids);
  DELETE FROM public.student_siblings WHERE student_a_id = ANY(ids) OR student_b_id = ANY(ids);
  DELETE FROM public.sibling_dismissals WHERE student_a_id = ANY(ids) OR student_b_id = ANY(ids);
  DELETE FROM public.enrollments WHERE student_id = ANY(ids);
  UPDATE public.registrations SET existing_student_id = NULL WHERE existing_student_id = ANY(ids);
  DELETE FROM public.students WHERE id = ANY(ids);
END $$;