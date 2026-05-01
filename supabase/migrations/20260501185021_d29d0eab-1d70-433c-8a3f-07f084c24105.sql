
-- Rename enum value 'unusable' -> 'needs_repair'
ALTER TYPE public.instrument_condition RENAME VALUE 'unusable' TO 'needs_repair';

-- Add size column
ALTER TABLE public.inventory_instruments ADD COLUMN size TEXT;
