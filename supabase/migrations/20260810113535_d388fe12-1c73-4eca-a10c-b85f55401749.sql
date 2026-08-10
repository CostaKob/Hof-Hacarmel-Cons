CREATE OR REPLACE FUNCTION public.check_existing_registration(_national_id text, _year_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
        'exists', true,
        'created_at', r.created_at,
        'status', r.status,
        'requested_instruments', r.requested_instruments,
        'branch_school_name', r.branch_school_name
      )
     FROM public.registrations r
     WHERE r.academic_year_id = _year_id
       AND btrim(r.student_national_id) = btrim(_national_id)
       AND r.status <> 'rejected'
     ORDER BY r.created_at DESC
     LIMIT 1),
    jsonb_build_object('exists', false)
  )
$$;

GRANT EXECUTE ON FUNCTION public.check_existing_registration(text, uuid) TO anon, authenticated, service_role;