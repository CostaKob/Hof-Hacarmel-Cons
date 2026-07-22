
-- 1. Extend discount_types.applies_to to allow sibling_cheapest
ALTER TABLE public.discount_types DROP CONSTRAINT IF EXISTS discount_types_applies_to_check;
ALTER TABLE public.discount_types ADD CONSTRAINT discount_types_applies_to_check
  CHECK (applies_to = ANY (ARRAY['all'::text, 'cheapest_enrollment'::text, 'sibling_cheapest'::text]));

-- 2. Sibling links table (canonical unordered pair: student_a_id < student_b_id)
CREATE TABLE public.student_siblings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_a_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_b_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  match_score smallint NOT NULL DEFAULT 100,
  match_reason text,
  confirmed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_siblings_pair_order CHECK (student_a_id < student_b_id),
  CONSTRAINT student_siblings_unique_pair UNIQUE (student_a_id, student_b_id)
);
CREATE INDEX student_siblings_a_idx ON public.student_siblings(student_a_id);
CREATE INDEX student_siblings_b_idx ON public.student_siblings(student_b_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_siblings TO authenticated;
GRANT ALL ON public.student_siblings TO service_role;

ALTER TABLE public.student_siblings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Secretary manage siblings" ON public.student_siblings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'secretary'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'secretary'::app_role));

-- 3. Phone normalization helper: keep last 10 digits
CREATE OR REPLACE FUNCTION public._norm_phone(_p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(RIGHT(regexp_replace(COALESCE(_p, ''), '[^0-9]', '', 'g'), 10), '')
$$;

-- 4. RPC: find sibling candidates for a student
CREATE OR REPLACE FUNCTION public.get_sibling_candidates(_student_id uuid)
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  grade text,
  city text,
  parent_name text,
  parent_phone text,
  match_score smallint,
  match_reason text,
  already_linked boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
  )
  SELECT c.id, c.first_name, c.last_name, c.grade, c.city,
         c.parent_name, c.parent_phone,
         c.score::smallint, c.reason,
         EXISTS(
           SELECT 1 FROM public.student_siblings ss
           WHERE (ss.student_a_id = LEAST(me.id, c.id)
                  AND ss.student_b_id = GREATEST(me.id, c.id))
         ) AS already_linked
  FROM candidates c
  WHERE c.score > 0
  ORDER BY c.score DESC, c.last_name, c.first_name;
END;
$$;

-- 5. RPC: get confirmed siblings for a student
CREATE OR REPLACE FUNCTION public.get_confirmed_siblings(_student_id uuid)
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  grade text,
  link_id uuid,
  match_reason text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.first_name, s.last_name, s.grade, ss.id AS link_id, ss.match_reason
  FROM public.student_siblings ss
  JOIN public.students s
    ON s.id = CASE WHEN ss.student_a_id = _student_id THEN ss.student_b_id ELSE ss.student_a_id END
  WHERE _student_id IN (ss.student_a_id, ss.student_b_id)
  ORDER BY s.first_name, s.last_name;
$$;
