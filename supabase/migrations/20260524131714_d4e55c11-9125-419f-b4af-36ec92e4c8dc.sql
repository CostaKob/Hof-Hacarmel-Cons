
-- =========================================================
-- 1) SCHOOL_MUSIC_PAYMENTS: remove public SELECT, replace with RPC for success page
-- =========================================================
DROP POLICY IF EXISTS "Anyone can view school_music_payments" ON public.school_music_payments;
DROP POLICY IF EXISTS "Anyone can submit school_music_payments" ON public.school_music_payments;

-- Allow secretaries to view
CREATE POLICY "Secretaries can view school_music_payments"
ON public.school_music_payments FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'secretary'::app_role));

-- Public lookup for payment status (used by post-payment success page)
CREATE OR REPLACE FUNCTION public.get_sm_payment_public_status(_payment_id uuid)
RETURNS TABLE (
  id uuid,
  payment_status school_music_payment_status,
  amount numeric,
  invoice_url text,
  icount_doc_number text,
  paid_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, payment_status, amount, invoice_url, icount_doc_number, paid_at
  FROM public.school_music_payments
  WHERE id = _payment_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_sm_payment_public_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_sm_payment_public_status(uuid) TO anon, authenticated;

-- =========================================================
-- 2) SCHOOL_MUSIC_SCHOOLS: remove anon select, expose safe public view
-- =========================================================
DROP POLICY IF EXISTS "Anon can view active school_music_schools" ON public.school_music_schools;

CREATE OR REPLACE VIEW public.school_music_schools_public
WITH (security_invoker = off) AS
SELECT
  id, school_name, slug, is_active, academic_year_id,
  classes_count, day_of_week, class_schedules, operating_days,
  annual_tuition_fee, icount_payment_page_url
FROM public.school_music_schools
WHERE is_active = true;

GRANT SELECT ON public.school_music_schools_public TO anon, authenticated;

-- Add a non-anon authenticated select policy so authenticated (non-admin) callers
-- that don't have a teacher relation can still see the safe view's underlying rows
-- via the security-definer-style view (off = uses creator perms = bypasses RLS).

-- =========================================================
-- 3) SCHOOL_MUSIC_CLASSES: remove anon select, expose safe public view
-- =========================================================
DROP POLICY IF EXISTS "Anon can view school_music_classes" ON public.school_music_classes;

CREATE OR REPLACE VIEW public.school_music_classes_public
WITH (security_invoker = off) AS
SELECT
  id, school_music_school_id, class_name,
  day_of_week, start_time, end_time
FROM public.school_music_classes;

GRANT SELECT ON public.school_music_classes_public TO anon, authenticated;

-- =========================================================
-- 4) INVENTORY_INSTRUMENTS: remove anon select, expose safe public view
-- =========================================================
DROP POLICY IF EXISTS "Anon can view available inventory_instruments" ON public.inventory_instruments;

CREATE OR REPLACE VIEW public.inventory_instruments_public
WITH (security_invoker = off) AS
SELECT
  id, instrument_id, serial_number, brand, model, size, condition
FROM public.inventory_instruments
WHERE condition = 'available'::instrument_condition;

GRANT SELECT ON public.inventory_instruments_public TO anon, authenticated;

-- =========================================================
-- 5) REGISTRATIONS: scope anon access to a specific token via RPC
-- =========================================================
DROP POLICY IF EXISTS "Anon can select registration by token" ON public.registrations;

CREATE OR REPLACE FUNCTION public.get_registration_by_token(_token text)
RETURNS SETOF public.registrations
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.registrations
  WHERE _token IS NOT NULL
    AND _token <> ''
    AND registration_token = _token
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_registration_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_registration_by_token(text) TO anon, authenticated;

-- =========================================================
-- 6) Remove anon INSERT on school_music_students; only the RPC creates them
-- =========================================================
DROP POLICY IF EXISTS "Anyone can submit school_music_students" ON public.school_music_students;

-- =========================================================
-- 7) Lock down SECURITY DEFINER functions that should not be publicly callable
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_teacher_id_for_user(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_registered_national_ids_for_year(uuid) FROM anon, authenticated;

-- Trigger functions: never need direct execute
REVOKE EXECUTE ON FUNCTION public.enforce_single_active_year() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.auto_close_repair_update_condition() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.detect_existing_student() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.auto_create_repair_on_condition_change() FROM anon, authenticated, public;
