
CREATE OR REPLACE FUNCTION public.lookup_student_by_national_id(_national_id text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(t) FROM (
    SELECT 
      first_name, last_name, national_id, 
      parent_phone, parent_name, parent_email,
      parent_national_id, phone, city, grade, gender
    FROM public.students
    WHERE national_id = _national_id
    AND is_active = true
    LIMIT 1
  ) t
$$;
