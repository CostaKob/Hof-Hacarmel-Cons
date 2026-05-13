
-- Allow anon to see only available inventory instruments (for public school music registration form)
CREATE POLICY "Anon can view available inventory_instruments"
ON public.inventory_instruments
FOR SELECT
TO anon
USING (condition = 'available');

-- SECURITY DEFINER function: register a school music student and optionally
-- create an instrument loan + mark the inventory item as loaned, atomically.
CREATE OR REPLACE FUNCTION public.register_school_music_student_with_loan(
  _payload jsonb,
  _inventory_instrument_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student_id uuid;
  _serial text;
  _current_condition instrument_condition;
BEGIN
  -- If an inventory item was selected, lock & validate it first.
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

    -- Force the chosen serial onto the registration payload
    _payload := _payload || jsonb_build_object('instrument_serial_number', _serial);
  END IF;

  -- Insert the school music student row from the supplied JSON payload
  INSERT INTO public.school_music_students
  SELECT * FROM jsonb_populate_record(NULL::public.school_music_students, _payload)
  RETURNING id INTO _student_id;

  -- Create the loan + flip condition
  IF _inventory_instrument_id IS NOT NULL THEN
    INSERT INTO public.instrument_loans (inventory_instrument_id, school_music_student_id, loan_date)
    VALUES (_inventory_instrument_id, _student_id, CURRENT_DATE);

    UPDATE public.inventory_instruments
    SET condition = 'loaned'
    WHERE id = _inventory_instrument_id;
  END IF;

  RETURN _student_id;
END;
$$;

-- Allow public (anon + authenticated) to call the RPC
GRANT EXECUTE ON FUNCTION public.register_school_music_student_with_loan(jsonb, uuid) TO anon, authenticated;
