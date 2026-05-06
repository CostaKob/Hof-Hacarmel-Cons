-- Repairs table
CREATE TABLE public.instrument_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_instrument_id uuid NOT NULL REFERENCES public.inventory_instruments(id) ON DELETE CASCADE,
  sent_date date NOT NULL DEFAULT CURRENT_DATE,
  return_date date,
  issue_description text,
  treatment_description text,
  technician_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_instrument_repairs_instrument ON public.instrument_repairs(inventory_instrument_id);
CREATE INDEX idx_instrument_repairs_open ON public.instrument_repairs(inventory_instrument_id) WHERE return_date IS NULL;

ALTER TABLE public.instrument_repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage instrument_repairs" ON public.instrument_repairs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Secretaries can view instrument_repairs" ON public.instrument_repairs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'secretary'::app_role));

CREATE POLICY "Teachers can view instrument_repairs" ON public.instrument_repairs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'teacher'::app_role));

CREATE TRIGGER trg_instrument_repairs_updated_at
  BEFORE UPDATE ON public.instrument_repairs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-open a repair record when instrument condition transitions to in_repair / needs_repair
CREATE OR REPLACE FUNCTION public.auto_create_repair_on_condition_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.condition IN ('in_repair','needs_repair')
     AND (OLD.condition IS DISTINCT FROM NEW.condition)
     AND OLD.condition NOT IN ('in_repair','needs_repair') THEN
    -- Only if no open repair already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.instrument_repairs
      WHERE inventory_instrument_id = NEW.id AND return_date IS NULL
    ) THEN
      INSERT INTO public.instrument_repairs (inventory_instrument_id, sent_date)
      VALUES (NEW.id, CURRENT_DATE);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_instruments_auto_repair
  AFTER UPDATE OF condition ON public.inventory_instruments
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_repair_on_condition_change();

-- When a repair is closed (return_date set), if no other open repair, switch instrument back to 'available' (unless loaned)
CREATE OR REPLACE FUNCTION public.auto_close_repair_update_condition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_open boolean;
  has_active_loan boolean;
  current_condition instrument_condition;
BEGIN
  IF NEW.return_date IS NOT NULL AND OLD.return_date IS NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.instrument_repairs
      WHERE inventory_instrument_id = NEW.inventory_instrument_id
        AND return_date IS NULL
        AND id <> NEW.id
    ) INTO has_open;

    IF NOT has_open THEN
      SELECT condition INTO current_condition FROM public.inventory_instruments WHERE id = NEW.inventory_instrument_id;
      IF current_condition IN ('in_repair','needs_repair') THEN
        SELECT EXISTS(
          SELECT 1 FROM public.instrument_loans
          WHERE inventory_instrument_id = NEW.inventory_instrument_id
            AND return_date IS NULL
        ) INTO has_active_loan;
        UPDATE public.inventory_instruments
        SET condition = CASE WHEN has_active_loan THEN 'loaned'::instrument_condition ELSE 'available'::instrument_condition END
        WHERE id = NEW.inventory_instrument_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_instrument_repairs_auto_close
  AFTER UPDATE OF return_date ON public.instrument_repairs
  FOR EACH ROW EXECUTE FUNCTION public.auto_close_repair_update_condition();