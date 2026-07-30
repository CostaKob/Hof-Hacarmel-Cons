-- Find likely duplicate family cells for a given parent national id
CREATE OR REPLACE FUNCTION public.find_family_merge_candidates(_national_id text)
RETURNS TABLE(
  parent_national_id text,
  parent_name text,
  parent_phone text,
  parent_email text,
  children_count int,
  children_names text[],
  match_reason text,
  score smallint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me record;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary')) THEN
    RETURN;
  END IF;

  SELECT p.id, p.national_id, p.full_name, public._norm_phone(p.phone) AS ph
    INTO me
  FROM public.parents p
  WHERE p.national_id = _national_id
  LIMIT 1;

  IF me.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH my_children AS (
    SELECT s.id, s.last_name, s.city
    FROM public.students s
    WHERE s.is_active = true
      AND (s.parent_1_id = me.id OR s.parent_2_id = me.id)
  ),
  other AS (
    SELECT p.id AS pid, p.national_id, p.full_name, p.phone, p.email,
           public._norm_phone(p.phone) AS ph,
           s.id AS student_id, s.last_name, s.city,
           TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')) AS student_name
    FROM public.parents p
    JOIN public.students s
      ON (s.parent_1_id = p.id OR s.parent_2_id = p.id)
    WHERE p.id <> me.id
      AND s.is_active = true
  ),
  scored AS (
    SELECT o.national_id, o.full_name, o.phone, o.email,
           COUNT(DISTINCT o.student_id)::int AS cnt,
           ARRAY_AGG(DISTINCT o.student_name) AS names,
           MAX(
             CASE
               WHEN EXISTS (SELECT 1 FROM my_children mc WHERE mc.id = o.student_id) THEN 100
               WHEN o.ph IS NOT NULL AND me.ph IS NOT NULL AND o.ph = me.ph THEN 90
               WHEN EXISTS (
                 SELECT 1 FROM public.student_siblings ss, my_children mc
                 WHERE (ss.student_a_id = LEAST(mc.id, o.student_id)
                        AND ss.student_b_id = GREATEST(mc.id, o.student_id))
               ) THEN 85
               WHEN EXISTS (
                 SELECT 1 FROM my_children mc
                 WHERE LOWER(TRIM(mc.last_name)) = LOWER(TRIM(o.last_name))
                   AND mc.city IS NOT NULL AND o.city IS NOT NULL
                   AND LOWER(TRIM(mc.city)) = LOWER(TRIM(o.city))
               ) THEN 45
               ELSE 0
             END
           ) AS sc
    FROM other o
    GROUP BY o.national_id, o.full_name, o.phone, o.email
  )
  SELECT sc.national_id, sc.full_name, sc.phone, sc.email, sc.cnt, sc.names,
         CASE sc.sc
           WHEN 100 THEN 'ילד משותף'
           WHEN 90 THEN 'אותו טלפון'
           WHEN 85 THEN 'קישור אחים קיים'
           WHEN 45 THEN 'שם משפחה + עיר'
           ELSE NULL
         END,
         sc.sc::smallint
  FROM scored sc
  WHERE sc.sc > 0
  ORDER BY sc.sc DESC, sc.full_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_family_merge_candidates(text) TO authenticated;

-- Merge two family cells into one household
CREATE OR REPLACE FUNCTION public.merge_families(_target_national_id text, _source_national_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target record;
  _source record;
  _child record;
  _other record;
  _kids uuid[];
  _linked int := 0;
  _sib int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary')) THEN
    RAISE EXCEPTION 'אין הרשאה לבצע מיזוג משפחות';
  END IF;

  IF _target_national_id = _source_national_id THEN
    RAISE EXCEPTION 'לא ניתן למזג משפחה עם עצמה';
  END IF;

  SELECT * INTO _target FROM public.parents WHERE national_id = _target_national_id LIMIT 1;
  SELECT * INTO _source FROM public.parents WHERE national_id = _source_national_id LIMIT 1;

  IF _target.id IS NULL OR _source.id IS NULL THEN
    RAISE EXCEPTION 'אחד ההורים לא נמצא';
  END IF;

  SELECT COALESCE(ARRAY_AGG(DISTINCT s.id), '{}') INTO _kids
  FROM public.students s
  WHERE s.is_active = true
    AND (s.parent_1_id IN (_target.id, _source.id) OR s.parent_2_id IN (_target.id, _source.id));

  -- Ensure each child is linked to both parents (fill free slots only)
  FOR _child IN SELECT * FROM public.students WHERE id = ANY(_kids) LOOP
    IF _child.parent_1_id IS DISTINCT FROM _target.id AND _child.parent_2_id IS DISTINCT FROM _target.id THEN
      IF _child.parent_1_id IS NULL THEN
        UPDATE public.students SET parent_1_id = _target.id,
          parent_national_id = _target.national_id, parent_name = _target.full_name,
          parent_phone = _target.phone, parent_email = _target.email
        WHERE id = _child.id;
        _linked := _linked + 1;
      ELSIF _child.parent_2_id IS NULL THEN
        UPDATE public.students SET parent_2_id = _target.id,
          parent_national_id_2 = _target.national_id, parent_name_2 = _target.full_name,
          parent_phone_2 = _target.phone, parent_email_2 = _target.email
        WHERE id = _child.id;
        _linked := _linked + 1;
      END IF;
    END IF;

    SELECT * INTO _child FROM public.students WHERE id = _child.id;

    IF _child.parent_1_id IS DISTINCT FROM _source.id AND _child.parent_2_id IS DISTINCT FROM _source.id THEN
      IF _child.parent_1_id IS NULL THEN
        UPDATE public.students SET parent_1_id = _source.id,
          parent_national_id = _source.national_id, parent_name = _source.full_name,
          parent_phone = _source.phone, parent_email = _source.email
        WHERE id = _child.id;
        _linked := _linked + 1;
      ELSIF _child.parent_2_id IS NULL THEN
        UPDATE public.students SET parent_2_id = _source.id,
          parent_national_id_2 = _source.national_id, parent_name_2 = _source.full_name,
          parent_phone_2 = _source.phone, parent_email_2 = _source.email
        WHERE id = _child.id;
        _linked := _linked + 1;
      END IF;
    END IF;
  END LOOP;

  -- Link all children as siblings
  FOR _child IN SELECT unnest(_kids) AS id LOOP
    FOR _other IN SELECT unnest(_kids) AS id LOOP
      IF _child.id < _other.id THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.student_siblings ss
          WHERE ss.student_a_id = _child.id AND ss.student_b_id = _other.id
        ) THEN
          INSERT INTO public.student_siblings (student_a_id, student_b_id, match_score, match_reason, confirmed_by)
          VALUES (_child.id, _other.id, 100, 'מיזוג משפחות', auth.uid());
          _sib := _sib + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'children_count', COALESCE(array_length(_kids, 1), 0),
    'links_added', _linked,
    'siblings_added', _sib
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_families(text, text) TO authenticated;