CREATE OR REPLACE FUNCTION public.notify_student_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name text;
  _amt numeric;
  _is_credit boolean;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'paid' AND NEW.payment_status IS DISTINCT FROM 'failed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_status = NEW.payment_status THEN
    RETURN NEW;
  END IF;

  SELECT first_name || ' ' || last_name INTO _name FROM public.students WHERE id = NEW.student_id;
  _is_credit := COALESCE(NEW.amount, 0) < 0;
  _amt := abs(COALESCE(NEW.amount, 0));

  IF NEW.payment_status = 'paid' THEN
    PERFORM public.create_notification(
      'payment_paid',
      CASE WHEN _is_credit THEN 'בוצע זיכוי: ' ELSE 'התקבל תשלום: ' END
        || COALESCE(_name, 'תלמיד') || ' — ' || to_char(_amt, 'FM999999990.00') || ' ₪',
      NULLIF(NEW.notes, ''),
      CASE WHEN NEW.student_id IS NOT NULL THEN '/admin/students/' || NEW.student_id::text ELSE NULL END,
      NEW.id,
      NEW.academic_year_id
    );
  ELSE
    PERFORM public.create_notification(
      'payment_failed',
      CASE WHEN _is_credit THEN 'זיכוי נכשל: ' ELSE 'תשלום נכשל: ' END
        || COALESCE(_name, 'תלמיד') || ' — ' || to_char(_amt, 'FM999999990.00') || ' ₪',
      NULLIF(NEW.notes, ''),
      CASE WHEN NEW.student_id IS NOT NULL THEN '/admin/students/' || NEW.student_id::text ELSE NULL END,
      NEW.id,
      NEW.academic_year_id
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_sm_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name text;
  _amt numeric;
  _is_credit boolean;
BEGIN
  IF NEW.payment_status <> 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_status = NEW.payment_status THEN RETURN NEW; END IF;

  SELECT student_first_name || ' ' || student_last_name INTO _name
  FROM public.school_music_students WHERE id = NEW.school_music_student_id;

  _is_credit := COALESCE(NEW.amount, 0) < 0;
  _amt := abs(COALESCE(NEW.amount, 0));

  PERFORM public.create_notification(
    'payment_paid',
    CASE WHEN _is_credit THEN 'בוצע זיכוי (בית ספר מנגן): ' ELSE 'התקבל תשלום (בית ספר מנגן): ' END
      || COALESCE(_name, 'תלמיד') || ' — ' || to_char(_amt, 'FM999999990.00') || ' ₪',
    NULL,
    '/admin/school-music-payments',
    NEW.id,
    NEW.academic_year_id
  );
  RETURN NEW;
END; $$;