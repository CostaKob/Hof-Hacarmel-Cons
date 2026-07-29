
ALTER TABLE public.student_payments
  ADD COLUMN IF NOT EXISTS family_payment_group_id uuid,
  ADD COLUMN IF NOT EXISTS family_parent_national_id text;

CREATE INDEX IF NOT EXISTS idx_student_payments_family_group
  ON public.student_payments(family_payment_group_id)
  WHERE family_payment_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_payments_family_parent
  ON public.student_payments(family_parent_national_id)
  WHERE family_parent_national_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_parent_national_id
  ON public.students(parent_national_id)
  WHERE parent_national_id IS NOT NULL AND parent_national_id <> '';

CREATE INDEX IF NOT EXISTS idx_students_parent_national_id_2
  ON public.students(parent_national_id_2)
  WHERE parent_national_id_2 IS NOT NULL AND parent_national_id_2 <> '';

-- List families grouped by parent_national_id, active students only.
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
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH parent_rows AS (
    SELECT
      NULLIF(TRIM(s.parent_national_id), '') AS pid,
      s.parent_name AS pname,
      s.parent_phone AS pphone,
      s.parent_email AS pemail,
      s.id AS student_id,
      TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')) AS student_name,
      s.created_at
    FROM public.students s
    WHERE s.is_active = true
      AND NULLIF(TRIM(s.parent_national_id), '') IS NOT NULL
    UNION ALL
    SELECT
      NULLIF(TRIM(s.parent_national_id_2), '') AS pid,
      s.parent_name_2 AS pname,
      s.parent_phone_2 AS pphone,
      s.parent_email_2 AS pemail,
      s.id AS student_id,
      TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')) AS student_name,
      s.created_at
    FROM public.students s
    WHERE s.is_active = true
      AND NULLIF(TRIM(s.parent_national_id_2), '') IS NOT NULL
  ),
  agg AS (
    SELECT
      pid,
      -- pick a representative parent record (most recent)
      (ARRAY_AGG(pname ORDER BY created_at DESC NULLS LAST) FILTER (WHERE pname IS NOT NULL))[1] AS pname,
      (ARRAY_AGG(pphone ORDER BY created_at DESC NULLS LAST) FILTER (WHERE pphone IS NOT NULL))[1] AS pphone,
      (ARRAY_AGG(pemail ORDER BY created_at DESC NULLS LAST) FILTER (WHERE pemail IS NOT NULL))[1] AS pemail,
      COUNT(DISTINCT student_id)::int AS children_count,
      ARRAY_AGG(DISTINCT student_id) AS children_ids,
      ARRAY_AGG(DISTINCT student_name) AS children_names
    FROM parent_rows
    GROUP BY pid
  )
  SELECT pid, pname, pphone, pemail, children_count, children_ids, children_names
  FROM agg
  ORDER BY children_count DESC, pname NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_families(uuid) TO authenticated;
