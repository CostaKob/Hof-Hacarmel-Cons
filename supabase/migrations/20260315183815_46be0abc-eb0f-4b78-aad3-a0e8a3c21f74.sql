
-- Create registration_status enum
CREATE TYPE public.registration_status AS ENUM ('new', 'in_review', 'approved', 'rejected', 'converted');

-- Create registrations table
CREATE TABLE public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid REFERENCES public.academic_years(id),
  student_first_name text NOT NULL,
  student_last_name text NOT NULL,
  student_national_id text NOT NULL,
  gender text,
  student_status text,
  branch_school_name text NOT NULL,
  student_school_text text NOT NULL,
  grade text NOT NULL,
  city text NOT NULL,
  student_phone text,
  requested_instruments jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_lesson_duration text NOT NULL,
  parent_name text NOT NULL,
  parent_national_id text NOT NULL,
  parent_phone text NOT NULL,
  parent_email text NOT NULL,
  approval_checked boolean NOT NULL DEFAULT false,
  status registration_status NOT NULL DEFAULT 'new',
  existing_student_id uuid REFERENCES public.students(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can submit a registration
CREATE POLICY "Anyone can submit registration" ON public.registrations
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Admins can do everything
CREATE POLICY "Admins can manage registrations" ON public.registrations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Anon can view instruments for the public form
CREATE POLICY "Anon can view instruments" ON public.instruments
  FOR SELECT TO anon USING (true);

-- Anon can view schools for the public form
CREATE POLICY "Anon can view schools" ON public.schools
  FOR SELECT TO anon USING (true);

-- Anon can view academic_years for the public form
CREATE POLICY "Anon can view academic_years" ON public.academic_years
  FOR SELECT TO anon USING (true);

-- Auto-detect existing student by national_id on insert
CREATE OR REPLACE FUNCTION public.detect_existing_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.student_national_id IS NOT NULL AND NEW.student_national_id != '' THEN
    SELECT id INTO NEW.existing_student_id
    FROM public.students
    WHERE national_id = NEW.student_national_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER detect_existing_student_trigger
  BEFORE INSERT ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.detect_existing_student();
