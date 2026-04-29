CREATE OR REPLACE FUNCTION public.get_registered_national_ids_for_year(_year_id uuid)
RETURNS TABLE(national_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT student_national_id
  FROM public.registrations
  WHERE academic_year_id = _year_id
    AND student_national_id IS NOT NULL
    AND student_national_id <> ''
$$;

GRANT EXECUTE ON FUNCTION public.get_registered_national_ids_for_year(uuid) TO authenticated;