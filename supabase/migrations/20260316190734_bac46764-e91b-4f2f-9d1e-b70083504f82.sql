
-- Enum for ensemble types
CREATE TYPE public.ensemble_type AS ENUM (
  'orchestra',
  'big_band',
  'choir',
  'large_ensemble',
  'small_ensemble',
  'chamber_ensemble'
);

-- Enum for ensemble staff roles
CREATE TYPE public.ensemble_staff_role AS ENUM (
  'conductor',
  'instructor',
  'piano_accompanist',
  'vocal_accompanist'
);

-- Main ensembles table
CREATE TABLE public.ensembles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  ensemble_type ensemble_type NOT NULL,
  academic_year_id UUID REFERENCES public.academic_years(id),
  school_id UUID REFERENCES public.schools(id),
  weekly_hours NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ensembles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ensembles" ON public.ensembles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view ensembles" ON public.ensembles FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'teacher'::app_role));

-- Ensemble students (link students to ensembles)
CREATE TABLE public.ensemble_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ensemble_id UUID NOT NULL REFERENCES public.ensembles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ensemble_id, student_id)
);

ALTER TABLE public.ensemble_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ensemble_students" ON public.ensemble_students FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view ensemble_students" ON public.ensemble_students FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'teacher'::app_role));

-- Ensemble staff (link teachers with roles to ensembles)
CREATE TABLE public.ensemble_staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ensemble_id UUID NOT NULL REFERENCES public.ensembles(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  role ensemble_staff_role NOT NULL,
  weekly_hours NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ensemble_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ensemble_staff" ON public.ensemble_staff FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view ensemble_staff" ON public.ensemble_staff FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'teacher'::app_role));
