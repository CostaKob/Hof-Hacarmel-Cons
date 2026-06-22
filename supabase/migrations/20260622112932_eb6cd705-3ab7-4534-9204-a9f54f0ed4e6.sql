
CREATE OR REPLACE FUNCTION public.get_public_teachers()
RETURNS TABLE(id uuid, first_name text, last_name text, instruments text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.first_name, t.last_name,
         COALESCE(array_agg(i.name ORDER BY i.name) FILTER (WHERE i.name IS NOT NULL), ARRAY[]::text[]) AS instruments
  FROM public.teachers t
  JOIN public.teacher_instruments ti ON ti.teacher_id = t.id
  JOIN public.instruments i ON i.id = ti.instrument_id
  WHERE t.is_active = true
    AND COALESCE(t.is_office, false) = false
  GROUP BY t.id, t.first_name, t.last_name
  ORDER BY t.first_name, t.last_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_teachers() TO anon, authenticated;
