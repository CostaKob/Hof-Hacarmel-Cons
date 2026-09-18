CREATE OR REPLACE FUNCTION public.sync_public_teacher_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.public_teacher_contacts WHERE teacher_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.is_active = true
     AND NOT COALESCE(NEW.is_freelance, false)
     AND NOT COALESCE(NEW.is_office, false) THEN
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
$$;

DELETE FROM public.public_teacher_contacts p
USING public.teachers t
WHERE p.teacher_id = t.id
  AND (
    NOT t.is_active
    OR COALESCE(t.is_freelance, false)
    OR COALESCE(t.is_office, false)
  );

INSERT INTO public.public_teacher_contacts (teacher_id, first_name, last_name, phone, email, is_freelance)
SELECT id, first_name, last_name, phone, email, false
FROM public.teachers
WHERE is_active = true
  AND NOT COALESCE(is_freelance, false)
  AND NOT COALESCE(is_office, false)
ON CONFLICT (teacher_id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email;

CREATE OR REPLACE FUNCTION public.get_public_teacher_contacts()
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  phone text,
  email text,
  is_freelance boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.first_name,
    t.last_name,
    t.phone,
    t.email,
    false
  FROM public.teachers AS t
  WHERE t.is_active = true
    AND NOT COALESCE(t.is_freelance, false)
    AND NOT COALESCE(t.is_office, false)
  ORDER BY t.last_name COLLATE "C", t.first_name COLLATE "C";
$$;

GRANT EXECUTE ON FUNCTION public.get_public_teacher_contacts() TO anon, authenticated, service_role;