DROP TRIGGER IF EXISTS trg_enforce_single_active_year ON public.academic_years;

CREATE OR REPLACE FUNCTION public.enforce_single_active_year()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.is_active IS TRUE THEN
    UPDATE public.academic_years
    SET is_active = FALSE
    WHERE id <> NEW.id
      AND is_active IS TRUE;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_single_active_year
AFTER INSERT OR UPDATE OF is_active ON public.academic_years
FOR EACH ROW
WHEN (NEW.is_active IS TRUE)
EXECUTE FUNCTION public.enforce_single_active_year();