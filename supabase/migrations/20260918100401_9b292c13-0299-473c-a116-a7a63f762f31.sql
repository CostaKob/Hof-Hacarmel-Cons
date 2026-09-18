CREATE OR REPLACE FUNCTION public.get_public_teacher_contacts()
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  phone text,
  email text,
  is_freelance boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.first_name,
    t.last_name,
    t.phone,
    t.email,
    COALESCE(t.is_freelance, false)
  FROM public.teachers AS t
  WHERE t.is_active = true
  ORDER BY t.last_name COLLATE "C", t.first_name COLLATE "C";
$$;

REVOKE ALL ON FUNCTION public.get_public_teacher_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_teacher_contacts() TO anon, authenticated, service_role;