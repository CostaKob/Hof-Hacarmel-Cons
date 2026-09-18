CREATE OR REPLACE FUNCTION public.sync_public_teacher_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.public_teacher_contacts WHERE teacher_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.is_active = true
     AND NOT COALESCE(NEW.is_freelance, false)
     AND (NOT COALESCE(NEW.is_office, false) OR NEW.id = 'fce6e761-bd64-445c-b788-a94cabb735ab') THEN
    INSERT INTO public.public_teacher_contacts (teacher_id, first_name, last_name, phone, email, is_freelance)
    VALUES (NEW.id, NEW.first_name, NEW.last_name, NEW.phone, NEW.email, false)
    ON CONFLICT (teacher_id) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      is_freelance = EXCLUDED.is_freelance;
  ELSE
    DELETE FROM public.public_teacher_contacts WHERE teacher_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

INSERT INTO public.public_teacher_contacts (teacher_id, first_name, last_name, phone, email, is_freelance)
SELECT t.id, t.first_name, t.last_name, t.phone, t.email, false
FROM public.teachers t
WHERE t.id = 'fce6e761-bd64-445c-b788-a94cabb735ab'
  AND t.is_active = true
ON CONFLICT (teacher_id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email;