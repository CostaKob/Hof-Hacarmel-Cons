
-- ============================================================
-- Fix 1: server-forced fields must win the JSON merge
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_school_music_student_with_loan(_payload jsonb, _inventory_instrument_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _student_id uuid;
  _payment_id uuid;
  _serial text;
  _current_condition instrument_condition;
  _school_id uuid;
  _year_id uuid;
  _tuition numeric;
  _final_payload jsonb := _payload;
BEGIN
  IF _inventory_instrument_id IS NOT NULL THEN
    SELECT condition, serial_number
      INTO _current_condition, _serial
    FROM public.inventory_instruments
    WHERE id = _inventory_instrument_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory instrument not found';
    END IF;
    IF _current_condition <> 'available' THEN
      RAISE EXCEPTION 'Inventory instrument is no longer available';
    END IF;

    _final_payload := _final_payload || jsonb_build_object('instrument_serial_number', _serial);
  END IF;

  -- Server-forced fields on the RIGHT so they override any caller-supplied values
  _final_payload := _final_payload || jsonb_build_object(
    'id', gen_random_uuid(),
    'created_at', now(),
    'status', 'active'
  );

  INSERT INTO public.school_music_students
  SELECT * FROM jsonb_populate_record(NULL::public.school_music_students, _final_payload)
  RETURNING id, school_music_school_id, academic_year_id
    INTO _student_id, _school_id, _year_id;

  IF _inventory_instrument_id IS NOT NULL THEN
    INSERT INTO public.instrument_loans (inventory_instrument_id, school_music_student_id, loan_date)
    VALUES (_inventory_instrument_id, _student_id, CURRENT_DATE);

    UPDATE public.inventory_instruments
    SET condition = 'loaned'
    WHERE id = _inventory_instrument_id;
  END IF;

  SELECT annual_tuition_fee INTO _tuition
  FROM public.school_music_schools
  WHERE id = _school_id;

  IF _tuition IS NULL THEN
    _tuition := 0;
  END IF;

  INSERT INTO public.school_music_payments (
    school_music_student_id,
    school_music_school_id,
    academic_year_id,
    amount,
    payment_status,
    notes
  )
  VALUES (
    _student_id,
    _school_id,
    _year_id,
    _tuition,
    'pending',
    'נוצר אוטומטית בהרשמה'
  )
  RETURNING id INTO _payment_id;

  RETURN jsonb_build_object(
    'student_id', _student_id,
    'payment_id', _payment_id,
    'amount', _tuition
  );
END;
$function$;

-- ============================================================
-- Fix 3: rate-limit the public national-ID lookup
-- ============================================================
CREATE TABLE IF NOT EXISTS public.national_id_lookup_attempts (
  id bigserial PRIMARY KEY,
  ip text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.national_id_lookup_attempts TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.national_id_lookup_attempts_id_seq TO anon, authenticated;
GRANT ALL ON public.national_id_lookup_attempts TO service_role;
GRANT ALL ON SEQUENCE public.national_id_lookup_attempts_id_seq TO service_role;

ALTER TABLE public.national_id_lookup_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS national_id_lookup_attempts_ip_time_idx
  ON public.national_id_lookup_attempts (ip, attempted_at DESC);

-- Nobody but service_role reads/writes directly; the SECURITY DEFINER function
-- below handles inserts and lookups on behalf of anon.
CREATE POLICY "service role manages lookup attempts"
  ON public.national_id_lookup_attempts
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Wrap the existing lookup RPC with a rate-limit check based on client IP
CREATE OR REPLACE FUNCTION public.lookup_student_by_national_id(_national_id text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ip text;
  _attempts int;
  _result json;
BEGIN
  -- Best-effort IP extraction from PostgREST headers
  BEGIN
    _ip := split_part(
      COALESCE(
        current_setting('request.headers', true)::json ->> 'x-forwarded-for',
        current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
        ''
      ),
      ',', 1
    );
    _ip := NULLIF(trim(_ip), '');
  EXCEPTION WHEN OTHERS THEN
    _ip := NULL;
  END;

  -- Count attempts from this IP in the last minute (only if we have an IP)
  IF _ip IS NOT NULL THEN
    SELECT count(*) INTO _attempts
    FROM public.national_id_lookup_attempts
    WHERE ip = _ip
      AND attempted_at > now() - interval '1 minute';

    IF _attempts >= 15 THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Log this attempt (fire-and-forget; ignore any failure)
  BEGIN
    INSERT INTO public.national_id_lookup_attempts (ip) VALUES (_ip);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Opportunistic cleanup: keep the table small
  BEGIN
    DELETE FROM public.national_id_lookup_attempts
    WHERE attempted_at < now() - interval '1 hour';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  SELECT row_to_json(t) INTO _result FROM (
    SELECT
      first_name, last_name, national_id,
      parent_phone, parent_name, parent_email,
      parent_national_id, phone, city, grade, gender
    FROM public.students
    WHERE national_id = _national_id
    AND is_active = true
    LIMIT 1
  ) t;

  RETURN _result;
END;
$function$;
