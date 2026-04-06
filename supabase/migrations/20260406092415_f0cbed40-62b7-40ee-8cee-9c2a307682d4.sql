
-- Create status enum
CREATE TYPE public.school_music_student_status AS ENUM ('new', 'in_review', 'assigned', 'inactive');

-- Create school_music_students table
CREATE TABLE public.school_music_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_music_school_id UUID NOT NULL REFERENCES public.school_music_schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id),
  student_first_name TEXT NOT NULL,
  student_last_name TEXT NOT NULL,
  student_national_id TEXT NOT NULL,
  gender TEXT,
  class_name TEXT NOT NULL,
  city TEXT,
  parent_name TEXT NOT NULL,
  parent_national_id TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  parent_email TEXT NOT NULL,
  instrument_id UUID REFERENCES public.instruments(id),
  instrument_serial_number TEXT,
  approval_checked BOOLEAN NOT NULL DEFAULT false,
  status school_music_student_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.school_music_students ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage school_music_students"
ON public.school_music_students
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can submit (public form)
CREATE POLICY "Anyone can submit school_music_students"
ON public.school_music_students
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Teachers can view students of their schools
CREATE POLICY "Teachers can view school_music_students"
ON public.school_music_students
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role) AND
  school_music_school_id IN (
    SELECT sms.id FROM public.school_music_schools sms
    WHERE sms.coordinator_teacher_id = get_teacher_id_for_user(auth.uid())
       OR sms.conductor_teacher_id = get_teacher_id_for_user(auth.uid())
       OR sms.id IN (
         SELECT smg.school_music_school_id FROM public.school_music_groups smg
         WHERE smg.teacher_id = get_teacher_id_for_user(auth.uid())
       )
  )
);
