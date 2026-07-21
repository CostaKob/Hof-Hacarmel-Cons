ALTER TABLE public.inventory_instruments
  ADD COLUMN IF NOT EXISTS last_verified_status text,
  ADD COLUMN IF NOT EXISTS last_verified_notes text;

ALTER TABLE public.inventory_instruments
  DROP CONSTRAINT IF EXISTS inventory_instruments_last_verified_status_check;

ALTER TABLE public.inventory_instruments
  ADD CONSTRAINT inventory_instruments_last_verified_status_check
  CHECK (last_verified_status IS NULL OR last_verified_status IN ('ok','needs_repair','needs_completion'));