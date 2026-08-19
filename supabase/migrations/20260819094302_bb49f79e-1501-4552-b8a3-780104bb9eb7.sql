CREATE OR REPLACE FUNCTION public.enforce_inventory_condition_from_loans()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.condition IN ('available', 'loaned') THEN
    IF EXISTS (
      SELECT 1
      FROM public.instrument_loans l
      WHERE l.inventory_instrument_id = NEW.id
        AND l.return_date IS NULL
    ) THEN
      NEW.condition := 'loaned';
    ELSE
      NEW.condition := 'available';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.inventory_instruments ii
SET condition = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.instrument_loans l
    WHERE l.inventory_instrument_id = ii.id
      AND l.return_date IS NULL
  ) THEN 'loaned'::public.instrument_condition
  ELSE 'available'::public.instrument_condition
END,
updated_at = now()
WHERE ii.condition IN ('available', 'loaned')
  AND ii.condition IS DISTINCT FROM CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.instrument_loans l
      WHERE l.inventory_instrument_id = ii.id
        AND l.return_date IS NULL
    ) THEN 'loaned'::public.instrument_condition
    ELSE 'available'::public.instrument_condition
  END;