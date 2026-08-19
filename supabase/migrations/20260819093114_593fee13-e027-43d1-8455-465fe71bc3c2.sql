CREATE OR REPLACE FUNCTION public.sync_instrument_condition_on_loan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv uuid;
  _has_active boolean;
  _cond instrument_condition;
BEGIN
  _inv := COALESCE(NEW.inventory_instrument_id, OLD.inventory_instrument_id);
  IF _inv IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.instrument_loans l
    WHERE l.inventory_instrument_id = _inv AND l.return_date IS NULL
  ) INTO _has_active;

  SELECT condition INTO _cond FROM public.inventory_instruments WHERE id = _inv;

  IF _has_active THEN
    IF _cond = 'available' THEN
      UPDATE public.inventory_instruments SET condition = 'loaned', updated_at = now() WHERE id = _inv;
    END IF;
  ELSE
    IF _cond = 'loaned' THEN
      UPDATE public.inventory_instruments SET condition = 'available', updated_at = now() WHERE id = _inv;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_instrument_condition_on_loan ON public.instrument_loans;
CREATE TRIGGER trg_sync_instrument_condition_on_loan
AFTER INSERT OR UPDATE OR DELETE ON public.instrument_loans
FOR EACH ROW EXECUTE FUNCTION public.sync_instrument_condition_on_loan();

-- one-time cleanup: instruments marked loaned with no open loan
UPDATE public.inventory_instruments i
SET condition = 'available', updated_at = now()
WHERE i.condition = 'loaned'
  AND NOT EXISTS (
    SELECT 1 FROM public.instrument_loans l
    WHERE l.inventory_instrument_id = i.id AND l.return_date IS NULL
  );