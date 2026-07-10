
CREATE OR REPLACE FUNCTION public.get_school_music_school_staff(_school_id uuid)
RETURNS TABLE(teacher_id uuid, first_name text, last_name text, phone text, role text, instrument text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := public.get_teacher_id_for_user(auth.uid());
  _allowed boolean;
BEGIN
  IF _me IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.school_music_schools s
    WHERE s.id = _school_id
      AND (s.coordinator_teacher_id = _me
           OR s.conductor_teacher_id = _me
           OR EXISTS (SELECT 1 FROM public.school_music_groups g
                      WHERE g.school_music_school_id = s.id AND g.teacher_id = _me)
           OR EXISTS (SELECT 1 FROM public.school_music_class_groups cg
                      JOIN public.school_music_classes c ON c.id = cg.school_music_class_id
                      WHERE c.school_music_school_id = s.id AND cg.teacher_id = _me))
  ) INTO _allowed;

  IF NOT _allowed THEN RETURN; END IF;

  RETURN QUERY
  WITH staff AS (
    SELECT s.coordinator_teacher_id AS tid, 'רכז'::text AS role, NULL::text AS instrument
    FROM public.school_music_schools s WHERE s.id = _school_id AND s.coordinator_teacher_id IS NOT NULL
    UNION ALL
    SELECT s.conductor_teacher_id, 'מנצח', NULL
    FROM public.school_music_schools s WHERE s.id = _school_id AND s.conductor_teacher_id IS NOT NULL
    UNION ALL
    SELECT cg.teacher_id, 'מורה לקבוצה', i.name
    FROM public.school_music_class_groups cg
    JOIN public.school_music_classes c ON c.id = cg.school_music_class_id
    LEFT JOIN public.instruments i ON i.id = cg.instrument_id
    WHERE c.school_music_school_id = _school_id AND cg.teacher_id IS NOT NULL
  )
  SELECT DISTINCT ON (st.tid, st.role, st.instrument)
    t.id, t.first_name, t.last_name, t.phone, st.role, st.instrument
  FROM staff st
  JOIN public.teachers t ON t.id = st.tid
  ORDER BY st.tid, st.role, st.instrument;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_school_music_school_staff(uuid) TO authenticated;
