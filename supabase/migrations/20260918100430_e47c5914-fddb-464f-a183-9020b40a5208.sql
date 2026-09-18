DROP FUNCTION IF EXISTS public.get_public_teacher_contacts();

CREATE TABLE public.public_teacher_contacts (
  teacher_id uuid PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  email text,
  is_freelance boolean NOT NULL DEFAULT false
);

GRANT SELECT ON public.public_teacher_contacts TO anon, authenticated;
GRANT ALL ON public.public_teacher_contacts TO service_role;

ALTER TABLE public.public_teacher_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active teacher contacts"
ON public.public_teacher_contacts
FOR SELECT
TO anon, authenticated
USING (true);

INSERT INTO public.public_teacher_contacts (teacher_id, first_name, last_name, phone, email, is_freelance)
SELECT id, first_name, last_name, phone, email, COALESCE(is_freelance, false)
FROM public.teachers
WHERE is_active = true;

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

  IF NEW.is_active = true THEN
    INSERT INTO public.public_teacher_contacts (teacher_id, first_name, last_name, phone, email, is_freelance)
    VALUES (NEW.id, NEW.first_name, NEW.last_name, NEW.phone, NEW.email, COALESCE(NEW.is_freelance, false))
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

REVOKE ALL ON FUNCTION public.sync_public_teacher_contact() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_public_teacher_contact() TO service_role;

CREATE TRIGGER sync_public_teacher_contact_after_change
AFTER INSERT OR UPDATE OR DELETE ON public.teachers
FOR EACH ROW
EXECUTE FUNCTION public.sync_public_teacher_contact();