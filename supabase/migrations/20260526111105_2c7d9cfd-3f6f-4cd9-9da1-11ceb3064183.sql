
-- 1. academic_years: restrict columns visible to anon (keep RLS policy, use column GRANT)
REVOKE SELECT ON public.academic_years FROM anon;
GRANT SELECT (id, name, start_date, end_date, is_active, registration_open, created_at)
  ON public.academic_years TO anon;

-- 2. Remove anonymous SELECT policies on internal staff-assignment tables
DROP POLICY IF EXISTS "Anon can view school_music_class_groups" ON public.school_music_class_groups;
DROP POLICY IF EXISTS "Anon can view school_music_groups" ON public.school_music_groups;

-- 3. Public helper for class groups (used by public registration form)
CREATE OR REPLACE FUNCTION public.list_public_class_groups(_class_id uuid)
RETURNS TABLE (
  id uuid,
  instrument_id uuid,
  instrument_name text,
  teacher_id uuid,
  teacher_first_name text,
  teacher_last_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cg.id, cg.instrument_id, i.name AS instrument_name,
         cg.teacher_id, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name
  FROM public.school_music_class_groups cg
  JOIN public.instruments i ON i.id = cg.instrument_id
  JOIN public.teachers t ON t.id = cg.teacher_id
  WHERE cg.school_music_class_id = _class_id;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_class_groups(uuid) TO anon, authenticated;
