CREATE OR REPLACE FUNCTION public.get_public_ensemble_contacts(_ensemble_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'name', e.name,
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'student_name', trim(concat(s.first_name, ' ', s.last_name)),
        'instrument', i.name,
        'city', s.city,
        'parent1_name', s.parent_name,
        'parent1_phone', s.parent_phone,
        'parent2_name', s.parent_name_2,
        'parent2_phone', s.parent_phone_2
      ) ORDER BY s.last_name, s.first_name)
      FROM ensemble_students es
      JOIN students s ON s.id = es.student_id
      LEFT JOIN enrollments en ON en.id = es.enrollment_id
      LEFT JOIN instruments i ON i.id = en.instrument_id
      WHERE es.ensemble_id = _ensemble_id
    ), '[]'::jsonb)
  )
  FROM ensembles e
  WHERE e.id = _ensemble_id AND e.is_active
$$;
GRANT EXECUTE ON FUNCTION public.get_public_ensemble_contacts(uuid) TO anon, authenticated;