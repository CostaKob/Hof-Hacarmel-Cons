CREATE OR REPLACE FUNCTION public.merge_duplicate_parents(_keep_national_id text, _remove_national_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _keep record;
  _remove record;
  _moved int := 0;
  _cleaned int := 0;
  _n int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary')) THEN
    RAISE EXCEPTION 'אין הרשאה לאיחוד רשומות הורה';
  END IF;

  IF _keep_national_id = _remove_national_id THEN
    RAISE EXCEPTION 'לא ניתן לאחד רשומה עם עצמה';
  END IF;

  SELECT * INTO _keep FROM public.parents WHERE national_id = _keep_national_id LIMIT 1;
  SELECT * INTO _remove FROM public.parents WHERE national_id = _remove_national_id LIMIT 1;

  IF _keep.id IS NULL OR _remove.id IS NULL THEN
    RAISE EXCEPTION 'אחת מרשומות ההורה לא נמצאה';
  END IF;

  -- Child linked to both records in slot1=remove, slot2=keep -> keep in slot1, clear slot2
  UPDATE public.students
  SET parent_1_id = _keep.id,
      parent_national_id = _keep.national_id,
      parent_name = _keep.full_name,
      parent_phone = _keep.phone,
      parent_email = _keep.email,
      parent_2_id = NULL,
      parent_national_id_2 = NULL,
      parent_name_2 = NULL,
      parent_phone_2 = NULL,
      parent_email_2 = NULL
  WHERE parent_1_id = _remove.id AND parent_2_id = _keep.id;
  GET DIAGNOSTICS _n = ROW_COUNT; _cleaned := _cleaned + _n;

  -- Child linked to both with slot1=keep, slot2=remove -> clear slot2
  UPDATE public.students
  SET parent_2_id = NULL,
      parent_national_id_2 = NULL,
      parent_name_2 = NULL,
      parent_phone_2 = NULL,
      parent_email_2 = NULL
  WHERE parent_2_id = _remove.id AND parent_1_id = _keep.id;
  GET DIAGNOSTICS _n = ROW_COUNT; _cleaned := _cleaned + _n;

  -- Remaining links move over to the kept record
  UPDATE public.students
  SET parent_1_id = _keep.id,
      parent_national_id = _keep.national_id,
      parent_name = _keep.full_name,
      parent_phone = _keep.phone,
      parent_email = _keep.email
  WHERE parent_1_id = _remove.id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;

  UPDATE public.students
  SET parent_2_id = _keep.id,
      parent_national_id_2 = _keep.national_id,
      parent_name_2 = _keep.full_name,
      parent_phone_2 = _keep.phone,
      parent_email_2 = _keep.email
  WHERE parent_2_id = _remove.id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;

  -- Fill any missing details on the kept record from the removed one
  UPDATE public.parents
  SET full_name = COALESCE(NULLIF(TRIM(full_name), ''), _remove.full_name),
      phone     = COALESCE(NULLIF(TRIM(phone), ''), _remove.phone),
      email     = COALESCE(NULLIF(TRIM(email), ''), _remove.email)
  WHERE id = _keep.id;

  DELETE FROM public.parents WHERE id = _remove.id;

  RETURN jsonb_build_object('moved', _moved, 'cleaned', _cleaned);
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_duplicate_parents(text, text) TO authenticated;