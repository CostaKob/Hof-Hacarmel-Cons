-- 1. repair_state enum + column
CREATE TYPE public.instrument_repair_state AS ENUM ('ok','needs_repair','in_repair');

ALTER TABLE public.inventory_instruments
  ADD COLUMN repair_state public.instrument_repair_state NOT NULL DEFAULT 'ok';

-- migrate existing condition values into the two axes
UPDATE public.inventory_instruments SET repair_state = 'in_repair' WHERE condition = 'in_repair';
UPDATE public.inventory_instruments SET repair_state = 'needs_repair' WHERE condition = 'needs_repair';
UPDATE public.inventory_instruments i
SET condition = CASE
  WHEN EXISTS (SELECT 1 FROM public.instrument_loans l WHERE l.inventory_instrument_id = i.id AND l.return_date IS NULL)
  THEN 'loaned'::instrument_condition ELSE 'available'::instrument_condition END
WHERE i.condition IN ('in_repair','needs_repair');

-- backfill from last verification
UPDATE public.inventory_instruments
SET repair_state = 'needs_repair'
WHERE repair_state = 'ok'
  AND last_verified_status IN ('needs_attention','needs_repair','needs_completion');

-- open repairs => in_repair
UPDATE public.inventory_instruments i
SET repair_state = 'in_repair'
WHERE EXISTS (SELECT 1 FROM public.instrument_repairs r WHERE r.inventory_instrument_id = i.id AND r.return_date IS NULL);

-- 2. instrument_checks table
CREATE TABLE public.instrument_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_instrument_id uuid NOT NULL REFERENCES public.inventory_instruments(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  checked_by uuid REFERENCES auth.users(id),
  result text NOT NULL CHECK (result IN ('ok','needs_repair','needs_completion','missing')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_instrument_checks_instrument ON public.instrument_checks(inventory_instrument_id);
CREATE INDEX idx_instrument_checks_year ON public.instrument_checks(academic_year_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instrument_checks TO authenticated;
GRANT ALL ON public.instrument_checks TO service_role;

ALTER TABLE public.instrument_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and secretaries can view instrument checks"
ON public.instrument_checks FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretary'));

CREATE POLICY "Admins and secretaries can insert instrument checks"
ON public.instrument_checks FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretary'));

CREATE POLICY "Admins and secretaries can update instrument checks"
ON public.instrument_checks FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretary'));

CREATE POLICY "Admins can delete instrument checks"
ON public.instrument_checks FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER instrument_checks_updated_at
BEFORE UPDATE ON public.instrument_checks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- migrate existing last_verified_* into checks of the active year
INSERT INTO public.instrument_checks (inventory_instrument_id, academic_year_id, checked_at, checked_by, result, notes)
SELECT i.id, y.id, i.last_verified_at, i.last_verified_by,
  CASE
    WHEN i.last_verified_status IN ('needs_attention','needs_repair') THEN 'needs_repair'
    WHEN i.last_verified_status = 'needs_completion' THEN 'needs_completion'
    WHEN i.last_verified_status = 'missing' THEN 'missing'
    ELSE 'ok' END,
  i.last_verified_notes
FROM public.inventory_instruments i
CROSS JOIN LATERAL (SELECT id FROM public.academic_years WHERE is_active LIMIT 1) y
WHERE i.last_verified_at IS NOT NULL;

-- 3. repair triggers now work against repair_state
CREATE OR REPLACE FUNCTION public.auto_create_repair_on_condition_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.repair_state IN ('in_repair','needs_repair')
     AND (OLD.repair_state IS DISTINCT FROM NEW.repair_state)
     AND OLD.repair_state NOT IN ('in_repair','needs_repair') THEN
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

CREATE OR REPLACE FUNCTION public.auto_close_repair_update_condition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_open boolean;
BEGIN
  IF NEW.return_date IS NOT NULL AND OLD.return_date IS NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.instrument_repairs
      WHERE inventory_instrument_id = NEW.inventory_instrument_id
        AND return_date IS NULL
        AND id <> NEW.id
    ) INTO has_open;

    IF NOT has_open THEN
      UPDATE public.inventory_instruments
      SET repair_state = 'ok'
      WHERE id = NEW.inventory_instrument_id
        AND repair_state IN ('in_repair','needs_repair');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;