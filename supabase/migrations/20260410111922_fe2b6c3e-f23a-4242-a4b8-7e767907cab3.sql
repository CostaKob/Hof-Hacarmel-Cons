DO $$
DECLARE
  target_year_id uuid;
BEGIN
  SELECT id
  INTO target_year_id
  FROM public.academic_years
  WHERE name ILIKE '%2025-2026%'
  ORDER BY start_date DESC
  LIMIT 1;

  IF target_year_id IS NULL THEN
    RAISE EXCEPTION 'Target academic year 2025-2026 not found';
  END IF;

  UPDATE public.academic_years
  SET is_active = FALSE
  WHERE is_active IS TRUE;

  UPDATE public.academic_years
  SET is_active = TRUE
  WHERE id = target_year_id;
END $$;