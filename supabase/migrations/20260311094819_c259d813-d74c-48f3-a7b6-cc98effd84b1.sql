
-- Indexes
CREATE INDEX idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX idx_enrollments_teacher_id ON public.enrollments(teacher_id);
CREATE INDEX idx_enrollments_school_id ON public.enrollments(school_id);
CREATE INDEX idx_enrollments_instrument_id ON public.enrollments(instrument_id);
CREATE INDEX idx_enrollments_start_date ON public.enrollments(start_date);
CREATE INDEX idx_enrollments_end_date ON public.enrollments(end_date);
CREATE INDEX idx_reports_teacher_date ON public.reports(teacher_id, report_date);
CREATE INDEX idx_reports_school_date ON public.reports(school_id, report_date);
CREATE INDEX idx_report_lines_report_id ON public.report_lines(report_id);
CREATE INDEX idx_report_lines_enrollment_id ON public.report_lines(enrollment_id);
CREATE INDEX idx_student_notes_student_id ON public.student_notes(student_id);
CREATE INDEX idx_student_notes_enrollment_id ON public.student_notes(enrollment_id);
CREATE INDEX idx_student_payments_enrollment_id ON public.student_payments(enrollment_id);
CREATE INDEX idx_teacher_instruments_teacher_id ON public.teacher_instruments(teacher_id);
CREATE INDEX idx_teacher_schools_teacher_id ON public.teacher_schools(teacher_id);

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_report_lines_updated_at
  BEFORE UPDATE ON public.report_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
