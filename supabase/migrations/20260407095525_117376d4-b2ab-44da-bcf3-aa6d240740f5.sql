
-- 1. Add principal/vice-principal fields to school_music_schools
ALTER TABLE public.school_music_schools
  ADD COLUMN IF NOT EXISTS principal_name text,
  ADD COLUMN IF NOT EXISTS principal_phone text,
  ADD COLUMN IF NOT EXISTS vice_principal_name text,
  ADD COLUMN IF NOT EXISTS vice_principal_phone text;

-- 2. Add day_of_week, start_time, end_time to school_music_classes
ALTER TABLE public.school_music_classes
  ADD COLUMN IF NOT EXISTS day_of_week smallint,
  ADD COLUMN IF NOT EXISTS start_time time without time zone,
  ADD COLUMN IF NOT EXISTS end_time time without time zone;

-- 3. Drop grade_level from school_music_classes
ALTER TABLE public.school_music_classes
  DROP COLUMN IF EXISTS grade_level;

-- 4. Create school_music_class_groups table
CREATE TABLE IF NOT EXISTS public.school_music_class_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_music_class_id uuid NOT NULL REFERENCES public.school_music_classes(id) ON DELETE CASCADE,
  instrument_id uuid NOT NULL REFERENCES public.instruments(id),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.school_music_class_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage school_music_class_groups"
  ON public.school_music_class_groups FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view school_music_class_groups"
  ON public.school_music_class_groups FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'teacher') AND
    school_music_class_id IN (
      SELECT smc.id FROM school_music_classes smc
      WHERE smc.school_music_school_id IN (
        SELECT sms.id FROM school_music_schools sms
        WHERE sms.coordinator_teacher_id = get_teacher_id_for_user(auth.uid())
           OR sms.conductor_teacher_id = get_teacher_id_for_user(auth.uid())
           OR sms.id IN (
             SELECT smg.school_music_school_id FROM school_music_groups smg
             WHERE smg.teacher_id = get_teacher_id_for_user(auth.uid())
           )
      )
    )
  );

-- 5. Migrate data: move session day/time into class, reassign groups from sessions to classes
-- Move day_of_week, start_time, end_time from sessions into classes
UPDATE public.school_music_classes c
SET day_of_week = s.day_of_week,
    start_time = s.start_time,
    end_time = s.end_time
FROM public.school_music_sessions s
WHERE s.school_music_class_id = c.id
  AND c.day_of_week IS NULL;

-- Move session_groups into class_groups
INSERT INTO public.school_music_class_groups (school_music_class_id, instrument_id, teacher_id)
SELECT DISTINCT s.school_music_class_id, sg.instrument_id, sg.teacher_id
FROM public.school_music_session_groups sg
JOIN public.school_music_sessions s ON s.id = sg.school_music_session_id;
