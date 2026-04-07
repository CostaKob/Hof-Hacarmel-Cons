
-- Create school_music_classes table
CREATE TABLE public.school_music_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_music_school_id uuid NOT NULL REFERENCES public.school_music_schools(id) ON DELETE CASCADE,
  class_name text NOT NULL,
  grade_level text,
  homeroom_teacher_name text,
  homeroom_teacher_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_music_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage school_music_classes" ON public.school_music_classes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view school_music_classes" ON public.school_music_classes
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'teacher'::app_role) AND
    school_music_school_id IN (
      SELECT id FROM public.school_music_schools
      WHERE coordinator_teacher_id = get_teacher_id_for_user(auth.uid())
        OR conductor_teacher_id = get_teacher_id_for_user(auth.uid())
        OR id IN (SELECT school_music_school_id FROM public.school_music_groups WHERE teacher_id = get_teacher_id_for_user(auth.uid()))
    )
  );

-- Create school_music_sessions table
CREATE TABLE public.school_music_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_music_school_id uuid NOT NULL REFERENCES public.school_music_schools(id) ON DELETE CASCADE,
  school_music_class_id uuid NOT NULL REFERENCES public.school_music_classes(id) ON DELETE CASCADE,
  day_of_week smallint,
  start_time time,
  end_time time,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_music_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage school_music_sessions" ON public.school_music_sessions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view school_music_sessions" ON public.school_music_sessions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'teacher'::app_role) AND
    school_music_school_id IN (
      SELECT id FROM public.school_music_schools
      WHERE coordinator_teacher_id = get_teacher_id_for_user(auth.uid())
        OR conductor_teacher_id = get_teacher_id_for_user(auth.uid())
        OR id IN (SELECT school_music_school_id FROM public.school_music_groups WHERE teacher_id = get_teacher_id_for_user(auth.uid()))
    )
  );

-- Create school_music_session_groups table
CREATE TABLE public.school_music_session_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_music_session_id uuid NOT NULL REFERENCES public.school_music_sessions(id) ON DELETE CASCADE,
  instrument_id uuid NOT NULL REFERENCES public.instruments(id),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_music_session_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage school_music_session_groups" ON public.school_music_session_groups
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view school_music_session_groups" ON public.school_music_session_groups
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'teacher'::app_role) AND
    school_music_session_id IN (
      SELECT id FROM public.school_music_sessions
      WHERE school_music_school_id IN (
        SELECT id FROM public.school_music_schools
        WHERE coordinator_teacher_id = get_teacher_id_for_user(auth.uid())
          OR conductor_teacher_id = get_teacher_id_for_user(auth.uid())
          OR id IN (SELECT school_music_school_id FROM public.school_music_groups WHERE teacher_id = get_teacher_id_for_user(auth.uid()))
      )
    )
  );

-- Migrate existing data: create classes from homeroom_teachers and sessions from class_schedules
DO $$
DECLARE
  school RECORD;
  ht jsonb;
  cs jsonb;
  i int;
  class_id uuid;
BEGIN
  FOR school IN SELECT id, classes_count, homeroom_teachers, class_schedules, day_of_week FROM public.school_music_schools WHERE classes_count > 0 LOOP
    FOR i IN 0..(school.classes_count - 1) LOOP
      ht := CASE WHEN jsonb_array_length(school.homeroom_teachers) > i THEN school.homeroom_teachers->i ELSE '{}'::jsonb END;
      cs := CASE WHEN jsonb_array_length(school.class_schedules) > i THEN school.class_schedules->i ELSE '{}'::jsonb END;

      INSERT INTO public.school_music_classes (school_music_school_id, class_name, homeroom_teacher_name, homeroom_teacher_phone)
      VALUES (school.id, 'כיתה ' || (i + 1), ht->>'name', ht->>'phone')
      RETURNING id INTO class_id;

      INSERT INTO public.school_music_sessions (school_music_school_id, school_music_class_id, day_of_week, start_time, end_time)
      VALUES (
        school.id,
        class_id,
        school.day_of_week,
        CASE WHEN cs->>'start_time' IS NOT NULL AND cs->>'start_time' != '' THEN (cs->>'start_time')::time ELSE NULL END,
        CASE WHEN cs->>'end_time' IS NOT NULL AND cs->>'end_time' != '' THEN (cs->>'end_time')::time ELSE NULL END
      );
    END LOOP;
  END LOOP;
END $$;
