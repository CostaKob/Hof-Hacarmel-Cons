
ALTER TABLE public.school_music_payments
  ADD COLUMN IF NOT EXISTS icount_payment_page_id text,
  ADD COLUMN IF NOT EXISTS payment_link_url text;

CREATE INDEX IF NOT EXISTS idx_sm_payments_student_status
  ON public.school_music_payments(school_music_student_id, payment_status);

DROP FUNCTION IF EXISTS public.register_school_music_student_with_loan(jsonb, uuid);

CREATE OR REPLACE FUNCTION public.register_school_music_student_with_loan(
  _payload jsonb,
  _inventory_instrument_id uuid DEFAULT NULL::uuid
)
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

    _payload := _payload || jsonb_build_object('instrument_serial_number', _serial);
  END IF;

  _payload := jsonb_build_object(
    'id', gen_random_uuid(),
    'created_at', now(),
    'status', 'new'
  ) || _payload;

  INSERT INTO public.school_music_students
  SELECT * FROM jsonb_populate_record(NULL::public.school_music_students, _payload)
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
