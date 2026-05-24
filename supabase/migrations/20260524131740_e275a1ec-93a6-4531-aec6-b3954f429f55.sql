
-- Drop the security-definer views and replace with SECURITY DEFINER functions
DROP VIEW IF EXISTS public.school_music_schools_public;
DROP VIEW IF EXISTS public.school_music_classes_public;
DROP VIEW IF EXISTS public.inventory_instruments_public;

-- Active schools (safe columns only)
CREATE OR REPLACE FUNCTION public.list_public_school_music_schools(_year_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  school_name text,
  slug text,
  is_active boolean,
  academic_year_id uuid,
  classes_count int,
  day_of_week smallint,
  class_schedules jsonb,
  operating_days smallint[],
  annual_tuition_fee numeric,
  icount_payment_page_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, school_name, slug, is_active, academic_year_id,
         classes_count, day_of_week, class_schedules, operating_days,
         annual_tuition_fee, icount_payment_page_url
  FROM public.school_music_schools
  WHERE is_active = true
    AND (_year_id IS NULL OR academic_year_id = _year_id)
  ORDER BY school_name;
$$;
REVOKE ALL ON FUNCTION public.list_public_school_music_schools(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_public_school_music_schools(uuid) TO anon, authenticated;

-- Single school resolver by slug (safe columns)
CREATE OR REPLACE FUNCTION public.get_public_school_music_school_by_slug(_slug text)
RETURNS TABLE (
  id uuid,
  academic_year_id uuid,
  is_active boolean,
  registration_open boolean,
  start_date date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.academic_year_id, s.is_active,
         y.registration_open, y.start_date
  FROM public.school_music_schools s
  JOIN public.academic_years y ON y.id = s.academic_year_id
  WHERE s.slug = _slug
    AND s.is_active = true;
$$;
REVOKE ALL ON FUNCTION public.get_public_school_music_school_by_slug(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_school_music_school_by_slug(text) TO anon, authenticated;

-- Get academic_year_id for a school (used in resolvedYear chain)
CREATE OR REPLACE FUNCTION public.get_school_music_school_year(_school_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT academic_year_id FROM public.school_music_schools WHERE id = _school_id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_school_music_school_year(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_school_music_school_year(uuid) TO anon, authenticated;

-- Classes for a school (safe columns)
CREATE OR REPLACE FUNCTION public.list_public_school_music_classes(_school_id uuid)
RETURNS TABLE (
  id uuid,
  school_music_school_id uuid,
  class_name text,
  day_of_week smallint,
  start_time time,
  end_time time
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, school_music_school_id, class_name, day_of_week, start_time, end_time
  FROM public.school_music_classes
  WHERE school_music_school_id = _school_id
  ORDER BY class_name;
$$;
REVOKE ALL ON FUNCTION public.list_public_school_music_classes(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_public_school_music_classes(uuid) TO anon, authenticated;

-- Available inventory instruments by instrument type (safe columns, no notes)
CREATE OR REPLACE FUNCTION public.list_public_available_inventory(_instrument_id uuid)
RETURNS TABLE (
  id uuid,
  serial_number text,
  brand text,
  model text,
  size text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, serial_number, brand, model, size
  FROM public.inventory_instruments
  WHERE condition = 'available'::instrument_condition
    AND instrument_id = _instrument_id
  ORDER BY serial_number;
$$;
REVOKE ALL ON FUNCTION public.list_public_available_inventory(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_public_available_inventory(uuid) TO anon, authenticated;
