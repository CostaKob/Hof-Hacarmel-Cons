ALTER TABLE public.inventory_instruments
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_instruments_last_verified_at
  ON public.inventory_instruments (last_verified_at);