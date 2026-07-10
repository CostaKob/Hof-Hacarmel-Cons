CREATE OR REPLACE FUNCTION public.teacher_can_view_school_music_school(_user_id uuid, _school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id AS teacher_id
    FROM public.teachers
    WHERE user_id = _user_id
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM me
    JOIN public.school_music_schools s ON s.id = _school_id
    WHERE s.coordinator_teacher_id = me.teacher_id
       OR s.conductor_teacher_id = me.teacher_id
       OR EXISTS (
            SELECT 1
            FROM public.school_music_groups g
            WHERE g.school_music_school_id = s.id
              AND g.teacher_id = me.teacher_id
          )
       OR EXISTS (
            SELECT 1
            FROM public.school_music_classes c
            JOIN public.school_music_class_groups cg ON cg.school_music_class_id = c.id
            WHERE c.school_music_school_id = s.id
              AND cg.teacher_id = me.teacher_id
          )
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_view_school_music_class(_user_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id AS teacher_id
    FROM public.teachers
    WHERE user_id = _user_id
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM me
    JOIN public.school_music_classes c ON c.id = _class_id
    JOIN public.school_music_schools s ON s.id = c.school_music_school_id
    WHERE s.coordinator_teacher_id = me.teacher_id
       OR s.conductor_teacher_id = me.teacher_id
       OR EXISTS (
            SELECT 1
            FROM public.school_music_groups g
            WHERE g.school_music_school_id = s.id
              AND g.teacher_id = me.teacher_id
          )
       OR EXISTS (
            SELECT 1
            FROM public.school_music_class_groups cg
            WHERE cg.school_music_class_id = c.id
              AND cg.teacher_id = me.teacher_id
          )
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_view_school_music_class_group(_user_id uuid, _class_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id AS teacher_id
    FROM public.teachers
    WHERE user_id = _user_id
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM me
    JOIN public.school_music_class_groups cg ON cg.id = _class_group_id
    JOIN public.school_music_classes c ON c.id = cg.school_music_class_id
    JOIN public.school_music_schools s ON s.id = c.school_music_school_id
    WHERE cg.teacher_id = me.teacher_id
       OR s.coordinator_teacher_id = me.teacher_id
       OR s.conductor_teacher_id = me.teacher_id
       OR EXISTS (
            SELECT 1
            FROM public.school_music_groups g
            WHERE g.school_music_school_id = s.id
              AND g.teacher_id = me.teacher_id
          )
  );
$$;

REVOKE ALL ON FUNCTION public.teacher_can_view_school_music_school(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_can_view_school_music_class(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_can_view_school_music_class_group(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_can_view_school_music_school(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_view_school_music_class(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_view_school_music_class_group(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Teachers can view assigned school_music_schools" ON public.school_music_schools;
CREATE POLICY "Teachers can view assigned school_music_schools"
ON public.school_music_schools
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'teacher'::public.app_role)
  AND public.teacher_can_view_school_music_school(auth.uid(), id)
);

DROP POLICY IF EXISTS "Teachers can view school_music_classes" ON public.school_music_classes;
CREATE POLICY "Teachers can view school_music_classes"
ON public.school_music_classes
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'teacher'::public.app_role)
  AND public.teacher_can_view_school_music_class(auth.uid(), id)
);

DROP POLICY IF EXISTS "Teachers can view school_music_class_groups" ON public.school_music_class_groups;
CREATE POLICY "Teachers can view school_music_class_groups"
ON public.school_music_class_groups
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'teacher'::public.app_role)
  AND public.teacher_can_view_school_music_class_group(auth.uid(), id)
);