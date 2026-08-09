CREATE OR REPLACE FUNCTION public.detect_existing_student()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _has_nid boolean := NEW.student_national_id IS NOT NULL AND btrim(NEW.student_national_id) <> '';
BEGIN
  IF _has_nid THEN
    SELECT id INTO NEW.existing_student_id
    FROM public.students
    WHERE btrim(national_id) = btrim(NEW.student_national_id)
    LIMIT 1;

    IF NEW.existing_student_id IS NOT NULL THEN
      NEW.match_type := 'id_match';
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.student_first_name IS NOT NULL AND NEW.student_last_name IS NOT NULL THEN
    SELECT id INTO NEW.existing_student_id
    FROM public.students
    WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(NEW.student_first_name))
      AND LOWER(TRIM(last_name)) = LOWER(TRIM(NEW.student_last_name))
      AND (
        NOT _has_nid
        OR national_id IS NULL
        OR btrim(national_id) = ''
      )
    LIMIT 1;

    IF NEW.existing_student_id IS NOT NULL THEN
      NEW.match_type := 'name_match';
      RETURN NEW;
    END IF;
  END IF;

  NEW.existing_student_id := NULL;
  NEW.match_type := NULL;
  RETURN NEW;
END;
$function$;