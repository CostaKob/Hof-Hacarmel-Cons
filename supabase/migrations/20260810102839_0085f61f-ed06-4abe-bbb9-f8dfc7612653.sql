ALTER TABLE public.student_payments
  ADD COLUMN IF NOT EXISTS cheque_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS cheque_cleared_at date,
  ADD COLUMN IF NOT EXISTS cheque_cancelled_at date,
  ADD COLUMN IF NOT EXISTS cheque_cancel_credit_id uuid REFERENCES public.student_payments(id) ON DELETE SET NULL;

ALTER TABLE public.student_payments
  DROP CONSTRAINT IF EXISTS student_payments_cheque_status_chk;
ALTER TABLE public.student_payments
  ADD CONSTRAINT student_payments_cheque_status_chk
  CHECK (cheque_status IN ('pending','cleared','cancelled'));

CREATE INDEX IF NOT EXISTS idx_student_payments_cheque_status
  ON public.student_payments (cheque_status);