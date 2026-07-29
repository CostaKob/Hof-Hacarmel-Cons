
CREATE OR REPLACE FUNCTION public.list_families(_year_id uuid DEFAULT NULL)
RETURNS TABLE(
  parent_national_id text,
  parent_name text,
  parent_phone text,
  parent_email text,
  children_count integer,
  children_ids uuid[],
  children_names text[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH linked AS (
    SELECT p.id AS parent_id, p.national_id, p.full_name, p.phone, p.email,
           s.id AS student_id,
           TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')) AS student_name
    FROM public.parents p
    JOIN public.students s
      ON s.parent_1_id = p.id OR s.parent_2_id = p.id
    WHERE s.is_active = true
  )
  SELECT
    national_id AS parent_national_id,
    MAX(full_name) AS parent_name,
    MAX(phone) AS parent_phone,
    MAX(email) AS parent_email,
    COUNT(DISTINCT student_id)::int AS children_count,
    ARRAY_AGG(DISTINCT student_id) AS children_ids,
    ARRAY_AGG(DISTINCT student_name) AS children_names
  FROM linked
  GROUP BY national_id
  ORDER BY children_count DESC, MAX(full_name) NULLS LAST;
$$;
