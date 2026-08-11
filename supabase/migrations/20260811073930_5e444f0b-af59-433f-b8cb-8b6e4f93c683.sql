DROP FUNCTION IF EXISTS public.list_families(uuid);

CREATE OR REPLACE FUNCTION public.list_families(_year_id uuid)
RETURNS TABLE(
  parent_national_id text,
  parent_name text,
  parent_phone text,
  parent_email text,
  children_count integer,
  children_ids uuid[],
  children_names text[],
  children_last_names text[],
  children_cities text[],
  partner_national_id text,
  partner_name text,
  partner_phone text,
  partner_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH linked AS (
    SELECT p.id AS parent_id, p.national_id, p.full_name, p.phone, p.email,
           s.id AS student_id,
           TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')) AS student_name,
           NULLIF(TRIM(COALESCE(s.last_name,'')), '') AS student_last_name,
           NULLIF(TRIM(COALESCE(s.city,'')), '') AS student_city
    FROM public.parents p
    JOIN public.students s
      ON s.parent_1_id = p.id OR s.parent_2_id = p.id
    WHERE s.is_active = true
  ),
  agg AS (
    SELECT
      national_id AS parent_national_id,
      MAX(full_name) AS parent_name,
      MAX(phone) AS parent_phone,
      MAX(email) AS parent_email,
      COUNT(DISTINCT student_id)::int AS children_count,
      ARRAY_AGG(DISTINCT student_id) AS children_ids,
      ARRAY_AGG(DISTINCT student_name) AS children_names,
      COALESCE(ARRAY_AGG(DISTINCT student_last_name) FILTER (WHERE student_last_name IS NOT NULL), ARRAY[]::text[]) AS children_last_names,
      COALESCE(ARRAY_AGG(DISTINCT student_city) FILTER (WHERE student_city IS NOT NULL), ARRAY[]::text[]) AS children_cities
    FROM linked
    GROUP BY national_id
  ),
  partners AS (
    SELECT DISTINCT ON (a.national_id)
      a.national_id,
      b.national_id AS partner_national_id,
      b.full_name AS partner_name,
      b.phone AS partner_phone,
      b.email AS partner_email
    FROM linked a
    JOIN linked b
      ON b.student_id = a.student_id
     AND b.national_id IS DISTINCT FROM a.national_id
    ORDER BY a.national_id, b.national_id
  )
  SELECT
    agg.parent_national_id,
    agg.parent_name,
    agg.parent_phone,
    agg.parent_email,
    agg.children_count,
    agg.children_ids,
    agg.children_names,
    agg.children_last_names,
    agg.children_cities,
    pt.partner_national_id,
    pt.partner_name,
    pt.partner_phone,
    pt.partner_email
  FROM agg
  LEFT JOIN partners pt ON pt.national_id = agg.parent_national_id
  ORDER BY agg.children_count DESC, agg.parent_name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_families(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_families(uuid) TO service_role;