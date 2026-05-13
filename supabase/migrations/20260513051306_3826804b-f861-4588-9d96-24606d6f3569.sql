-- 1. Add operating_days array to school_music_schools
ALTER TABLE public.school_music_schools
  ADD COLUMN IF NOT EXISTS operating_days smallint[] NOT NULL DEFAULT '{}';

-- Backfill from existing day_of_week
UPDATE public.school_music_schools
SET operating_days = ARRAY[day_of_week]::smallint[]
WHERE day_of_week IS NOT NULL
  AND (operating_days IS NULL OR array_length(operating_days, 1) IS NULL);

-- 2. Create attendance_status enum
DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present', 'absent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. teacher_attendance table
CREATE TABLE IF NOT EXISTS public.teacher_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_music_school_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  attendance_date date NOT NULL,
  status public.attendance_status NOT NULL,
  notes text,
  academic_year_id uuid NOT NULL,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_attendance_unique UNIQUE (school_music_school_id, teacher_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_teacher_attendance_school_date
  ON public.teacher_attendance (school_music_school_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_teacher_attendance_teacher_date
  ON public.teacher_attendance (teacher_id, attendance_date);

ALTER TABLE public.teacher_attendance ENABLE ROW LEVEL SECURITY;

-- Admin: full management
CREATE POLICY "Admins can manage teacher_attendance"
  ON public.teacher_attendance
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Coordinator: manage attendance for schools they coordinate
CREATE POLICY "Coordinators manage their school attendance"
  ON public.teacher_attendance
  FOR ALL TO authenticated
  USING (
    school_music_school_id IN (
      SELECT id FROM public.school_music_schools
      WHERE coordinator_teacher_id = get_teacher_id_for_user(auth.uid())
    )
  )
  WITH CHECK (
    school_music_school_id IN (
      SELECT id FROM public.school_music_schools
      WHERE coordinator_teacher_id = get_teacher_id_for_user(auth.uid())
    )
  );

-- Teacher: view own attendance
CREATE POLICY "Teachers view own attendance"
  ON public.teacher_attendance
  FOR SELECT TO authenticated
  USING (teacher_id = get_teacher_id_for_user(auth.uid()));

-- updated_at trigger
CREATE TRIGGER trg_teacher_attendance_updated_at
  BEFORE UPDATE ON public.teacher_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();