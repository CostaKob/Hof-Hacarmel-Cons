
CREATE OR REPLACE FUNCTION public.enforce_single_active_year()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.academic_years
    SET is_active = false
    WHERE id <> NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_single_active_year
BEFORE INSERT OR UPDATE OF is_active ON public.academic_years
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION public.enforce_single_active_year();
