CREATE OR REPLACE FUNCTION public.enforce_inventory_condition_from_loans()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.condition = 'available'
     AND EXISTS (
       SELECT 1
       FROM public.instrument_loans l
       WHERE l.inventory_instrument_id = NEW.id
         AND l.return_date IS NULL
     ) THEN
    NEW.condition := 'loaned';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_inventory_condition_from_loans ON public.inventory_instruments;
CREATE TRIGGER trg_enforce_inventory_condition_from_loans
BEFORE INSERT OR UPDATE OF condition ON public.inventory_instruments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_inventory_condition_from_loans();

UPDATE public.inventory_instruments i
SET condition = 'loaned', updated_at = now()
WHERE i.condition = 'available'
  AND EXISTS (
    SELECT 1
    FROM public.instrument_loans l
    WHERE l.inventory_instrument_id = i.id
      AND l.return_date IS NULL
  );