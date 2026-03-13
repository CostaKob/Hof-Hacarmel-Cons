
-- ============================================
-- RLS POLICIES FOR ALL TABLES
-- Uses existing has_role() function
-- Roles: admin (full), teacher (own data), secretary (limited)
-- ============================================

-- Helper: get teacher_id for current user
CREATE OR REPLACE FUNCTION public.get_teacher_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.teachers WHERE user_id = _user_id LIMIT 1
$$;

-- ============================================
-- PROFILES
-- ============================================
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================
-- USER_ROLES
-- ============================================
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- TEACHERS
-- ============================================
CREATE POLICY "Admins can manage teachers"
  ON public.teachers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view own record"
  ON public.teachers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Secretaries can view teachers"
  ON public.teachers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'secretary'));

-- ============================================
-- STUDENTS
-- ============================================
CREATE POLICY "Admins can manage students"
  ON public.students FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Secretaries can manage students"
  ON public.students FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'secretary'))
  WITH CHECK (public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Teachers can view their students"
  ON public.students FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT e.student_id FROM public.enrollments e
      WHERE e.teacher_id = public.get_teacher_id_for_user(auth.uid())
    )
  );

-- ============================================
-- SCHOOLS
-- ============================================
CREATE POLICY "Admins can manage schools"
  ON public.schools FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view schools"
  ON public.schools FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- INSTRUMENTS
-- ============================================
CREATE POLICY "Admins can manage instruments"
  ON public.instruments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view instruments"
  ON public.instruments FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- TEACHER_INSTRUMENTS
-- ============================================
CREATE POLICY "Admins can manage teacher_instruments"
  ON public.teacher_instruments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view own instruments"
  ON public.teacher_instruments FOR SELECT
  TO authenticated
  USING (teacher_id = public.get_teacher_id_for_user(auth.uid()));

CREATE POLICY "Secretaries can view teacher_instruments"
  ON public.teacher_instruments FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'secretary'));

-- ============================================
-- TEACHER_SCHOOLS
-- ============================================
CREATE POLICY "Admins can manage teacher_schools"
  ON public.teacher_schools FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view own schools"
  ON public.teacher_schools FOR SELECT
  TO authenticated
  USING (teacher_id = public.get_teacher_id_for_user(auth.uid()));

CREATE POLICY "Secretaries can view teacher_schools"
  ON public.teacher_schools FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'secretary'));

-- ============================================
-- ENROLLMENTS
-- ============================================
CREATE POLICY "Admins can manage enrollments"
  ON public.enrollments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Secretaries can manage enrollments"
  ON public.enrollments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'secretary'))
  WITH CHECK (public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Teachers can view own enrollments"
  ON public.enrollments FOR SELECT
  TO authenticated
  USING (teacher_id = public.get_teacher_id_for_user(auth.uid()));

-- ============================================
-- REPORTS
-- ============================================
CREATE POLICY "Admins can manage reports"
  ON public.reports FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can manage own reports"
  ON public.reports FOR ALL
  TO authenticated
  USING (teacher_id = public.get_teacher_id_for_user(auth.uid()))
  WITH CHECK (teacher_id = public.get_teacher_id_for_user(auth.uid()));

CREATE POLICY "Secretaries can view reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'secretary'));

-- ============================================
-- REPORT_LINES
-- ============================================
CREATE POLICY "Admins can manage report_lines"
  ON public.report_lines FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can manage own report_lines"
  ON public.report_lines FOR ALL
  TO authenticated
  USING (
    report_id IN (
      SELECT r.id FROM public.reports r
      WHERE r.teacher_id = public.get_teacher_id_for_user(auth.uid())
    )
  )
  WITH CHECK (
    report_id IN (
      SELECT r.id FROM public.reports r
      WHERE r.teacher_id = public.get_teacher_id_for_user(auth.uid())
    )
  );

CREATE POLICY "Secretaries can view report_lines"
  ON public.report_lines FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'secretary'));

-- ============================================
-- STUDENT_NOTES
-- ============================================
CREATE POLICY "Admins can manage student_notes"
  ON public.student_notes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Secretaries can manage student_notes"
  ON public.student_notes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'secretary'))
  WITH CHECK (public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Teachers can manage notes for their students"
  ON public.student_notes FOR ALL
  TO authenticated
  USING (
    student_id IN (
      SELECT e.student_id FROM public.enrollments e
      WHERE e.teacher_id = public.get_teacher_id_for_user(auth.uid())
    )
  )
  WITH CHECK (
    student_id IN (
      SELECT e.student_id FROM public.enrollments e
      WHERE e.teacher_id = public.get_teacher_id_for_user(auth.uid())
    )
  );

-- ============================================
-- STUDENT_PAYMENTS
-- ============================================
CREATE POLICY "Admins can manage student_payments"
  ON public.student_payments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Secretaries can manage student_payments"
  ON public.student_payments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'secretary'))
  WITH CHECK (public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Teachers can view payments for their enrollments"
  ON public.student_payments FOR SELECT
  TO authenticated
  USING (
    enrollment_id IN (
      SELECT e.id FROM public.enrollments e
      WHERE e.teacher_id = public.get_teacher_id_for_user(auth.uid())
    )
  );
