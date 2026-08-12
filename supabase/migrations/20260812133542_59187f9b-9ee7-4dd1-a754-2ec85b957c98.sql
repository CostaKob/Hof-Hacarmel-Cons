
CREATE TABLE IF NOT EXISTS public.sibling_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_a_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_b_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  dismissed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_a_id, student_b_id)
);

GRANT SELECT, INSERT, DELETE ON public.sibling_dismissals TO authenticated;
GRANT ALL ON public.sibling_dismissals TO service_role;

ALTER TABLE public.sibling_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage sibling dismissals"
ON public.sibling_dismissals FOR ALL
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretary'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretary'));

-- candidates: restrict to students active in a given academic year (when provided)
CREATE OR REPLACE FUNCTION public.get_sibling_candidates(_student_id uuid, _year_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, first_name text, last_name text, grade text, city text, parent_name text, parent_phone text, match_score smallint, match_reason text, already_linked boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me record;
BEGIN
  SELECT s.id, s.last_name, s.city,
         NULLIF(s.parent_national_id,'') AS pid1,
         NULLIF(s.parent_national_id_2,'') AS pid2,
         public._norm_phone(s.parent_phone) AS ph1,
         public._norm_phone(s.parent_phone_2) AS ph2
    INTO me
  FROM public.students s WHERE s.id = _student_id;

  IF me.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT s.id, s.first_name, s.last_name, s.grade, s.city,
           s.parent_name, s.parent_phone,
           CASE
             WHEN (NULLIF(s.parent_national_id,'') IS NOT NULL
                   AND NULLIF(s.parent_national_id,'') IN (me.pid1, me.pid2))
                OR (NULLIF(s.parent_national_id_2,'') IS NOT NULL
                   AND NULLIF(s.parent_national_id_2,'') IN (me.pid1, me.pid2))
               THEN 100
             WHEN (public._norm_phone(s.parent_phone) IS NOT NULL
                   AND public._norm_phone(s.parent_phone) IN (me.ph1, me.ph2))
                OR (public._norm_phone(s.parent_phone_2) IS NOT NULL
                   AND public._norm_phone(s.parent_phone_2) IN (me.ph1, me.ph2))
               THEN 80
             WHEN LOWER(TRIM(s.last_name)) = LOWER(TRIM(me.last_name))
                  AND s.city IS NOT NULL AND me.city IS NOT NULL
                  AND LOWER(TRIM(s.city)) = LOWER(TRIM(me.city))
               THEN 40
             ELSE 0
           END AS score,
           CASE
             WHEN (NULLIF(s.parent_national_id,'') IN (me.pid1, me.pid2))
                OR (NULLIF(s.parent_national_id_2,'') IN (me.pid1, me.pid2))
               THEN 'אותה ת.ז. הורה'
             WHEN (public._norm_phone(s.parent_phone) IN (me.ph1, me.ph2))
                OR (public._norm_phone(s.parent_phone_2) IN (me.ph1, me.ph2))
               THEN 'אותו טלפון הורה'
             WHEN LOWER(TRIM(s.last_name)) = LOWER(TRIM(me.last_name))
                  AND LOWER(TRIM(s.city)) = LOWER(TRIM(me.city))
               THEN 'שם משפחה + עיר'
             ELSE NULL
           END AS reason
    FROM public.students s
    WHERE s.id <> me.id AND s.is_active = true
      AND (
        _year_id IS NULL
        OR EXISTS (SELECT 1 FROM public.enrollments e
                   WHERE e.student_id = s.id AND e.academic_year_id = _year_id)
      )
  )
  SELECT c.id, c.first_name, c.last_name, c.grade, c.city,
         c.parent_name, c.parent_phone,
         c.score::smallint, c.reason,
         EXISTS(
           SELECT 1 FROM public.student_siblings ss
           WHERE ss.student_a_id = LEAST(me.id, c.id)
             AND ss.student_b_id = GREATEST(me.id, c.id)
         ) AS already_linked
  FROM candidates c
  WHERE c.score > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.sibling_dismissals d
      WHERE d.student_a_id = LEAST(me.id, c.id)
        AND d.student_b_id = GREATEST(me.id, c.id)
    )
  ORDER BY c.score DESC, c.last_name, c.first_name;
END;
$$;

-- auto link all 100% matches (same parent national id) for a given year
CREATE OR REPLACE FUNCTION public.auto_link_siblings_by_parent_id(_year_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretary')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH pool AS (
    SELECT s.id, s.parent_national_id, s.parent_national_id_2
    FROM public.students s
    WHERE s.is_active = true
      AND (_year_id IS NULL OR EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.student_id = s.id AND e.academic_year_id = _year_id))
  ), pairs AS (
    SELECT DISTINCT LEAST(a.id, b.id) AS sa, GREATEST(a.id, b.id) AS sb
    FROM pool a
    JOIN pool b ON a.id <> b.id
    WHERE (
      (NULLIF(a.parent_national_id,'') IS NOT NULL AND NULLIF(a.parent_national_id,'')
        IN (NULLIF(b.parent_national_id,''), NULLIF(b.parent_national_id_2,'')))
      OR (NULLIF(a.parent_national_id_2,'') IS NOT NULL AND NULLIF(a.parent_national_id_2,'')
        IN (NULLIF(b.parent_national_id,''), NULLIF(b.parent_national_id_2,'')))
    )
  ), ins AS (
    INSERT INTO public.student_siblings (student_a_id, student_b_id, match_score, match_reason, confirmed_by)
    SELECT p.sa, p.sb, 100, 'אותה ת.ז. הורה (אוטומטי)', auth.uid()
    FROM pairs p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_siblings ss
      WHERE ss.student_a_id = p.sa AND ss.student_b_id = p.sb
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.sibling_dismissals d
      WHERE d.student_a_id = p.sa AND d.student_b_id = p.sb
    )
    RETURNING 1
  )
  SELECT count(*)::int INTO inserted_count FROM ins;

  RETURN COALESCE(inserted_count, 0);
END;
$$;

-- pending sibling suggestions across all students of a year (non-100% matches)
CREATE OR REPLACE FUNCTION public.list_pending_sibling_pairs(_year_id uuid DEFAULT NULL)
RETURNS TABLE(
  student_a_id uuid, student_a_name text, student_a_grade text,
  student_b_id uuid, student_b_name text, student_b_grade text,
  city text, parent_a_name text, parent_a_phone text,
  parent_b_name text, parent_b_phone text,
  match_score smallint, match_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pool AS (
    SELECT s.*
    FROM public.students s
    WHERE s.is_active = true
      AND (_year_id IS NULL OR EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.student_id = s.id AND e.academic_year_id = _year_id))
  ), pairs AS (
    SELECT
      LEAST(a.id, b.id) AS sa_id, GREATEST(a.id, b.id) AS sb_id,
      a.id AS a_id, b.id AS b_id,
      a.first_name || ' ' || a.last_name AS a_name, a.grade AS a_grade,
      b.first_name || ' ' || b.last_name AS b_name, b.grade AS b_grade,
      a.city AS a_city, a.parent_name AS a_pname, a.parent_phone AS a_pphone,
      b.parent_name AS b_pname, b.parent_phone AS b_pphone,
      CASE
        WHEN (NULLIF(a.parent_national_id,'') IS NOT NULL AND NULLIF(a.parent_national_id,'')
              IN (NULLIF(b.parent_national_id,''), NULLIF(b.parent_national_id_2,'')))
          OR (NULLIF(a.parent_national_id_2,'') IS NOT NULL AND NULLIF(a.parent_national_id_2,'')
              IN (NULLIF(b.parent_national_id,''), NULLIF(b.parent_national_id_2,'')))
          THEN 100
        WHEN (public._norm_phone(a.parent_phone) IS NOT NULL AND public._norm_phone(a.parent_phone)
              IN (public._norm_phone(b.parent_phone), public._norm_phone(b.parent_phone_2)))
          OR (public._norm_phone(a.parent_phone_2) IS NOT NULL AND public._norm_phone(a.parent_phone_2)
              IN (public._norm_phone(b.parent_phone), public._norm_phone(b.parent_phone_2)))
          THEN 80
        WHEN LOWER(TRIM(a.last_name)) = LOWER(TRIM(b.last_name))
             AND a.city IS NOT NULL AND b.city IS NOT NULL
             AND LOWER(TRIM(a.city)) = LOWER(TRIM(b.city))
          THEN 40
        ELSE 0
      END AS score
    FROM pool a
    JOIN pool b ON a.id < b.id
  )
  SELECT p.a_id, p.a_name, p.a_grade, p.b_id, p.b_name, p.b_grade,
         p.a_city, p.a_pname, p.a_pphone, p.b_pname, p.b_pphone,
         p.score::smallint,
         CASE p.score WHEN 100 THEN 'אותה ת.ז. הורה'
                      WHEN 80 THEN 'אותו טלפון הורה'
                      WHEN 40 THEN 'שם משפחה + עיר' END
  FROM pairs p
  WHERE p.score > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.student_siblings ss
      WHERE ss.student_a_id = p.sa_id AND ss.student_b_id = p.sb_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.sibling_dismissals d
      WHERE d.student_a_id = p.sa_id AND d.student_b_id = p.sb_id)
  ORDER BY p.score DESC, p.a_name;
$$;
