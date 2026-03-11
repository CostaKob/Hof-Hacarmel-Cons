
-- Teacher-Instruments junction
CREATE TABLE public.teacher_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, instrument_id)
);
ALTER TABLE public.teacher_instruments ENABLE ROW LEVEL SECURITY;

-- Teacher-Schools junction
CREATE TABLE public.teacher_schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, school_id)
);
ALTER TABLE public.teacher_schools ENABLE ROW LEVEL SECURITY;

-- Enrollments
CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  enrollment_role enrollment_role NOT NULL DEFAULT 'primary',
  lesson_type lesson_type NOT NULL DEFAULT 'individual',
  lesson_duration_minutes INTEGER NOT NULL CHECK (lesson_duration_minutes > 0),
  price_per_lesson NUMERIC(10,2),
  teacher_rate_per_lesson NUMERIC(10,2),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
