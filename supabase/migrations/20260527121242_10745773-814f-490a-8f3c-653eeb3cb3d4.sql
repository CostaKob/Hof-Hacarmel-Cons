-- Status enum for student_payments (reuse style of school_music_payment_status)
DO $$ BEGIN
  CREATE TYPE public.student_payment_status AS ENUM ('pending', 'paid', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.student_payments
  ADD COLUMN IF NOT EXISTS payment_status public.student_payment_status NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS payment_link_url text,
  ADD COLUMN IF NOT EXISTS icount_payment_page_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS icount_transaction_id text;

-- Existing rows should default to 'paid' (already collected). For new pending
-- rows created by the paylink flow, the default of 'paid' is overridden.
UPDATE public.student_payments SET payment_status = 'paid' WHERE payment_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_payments_status_student
  ON public.student_payments(student_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_student_payments_payment_page
  ON public.student_payments(icount_payment_page_id);