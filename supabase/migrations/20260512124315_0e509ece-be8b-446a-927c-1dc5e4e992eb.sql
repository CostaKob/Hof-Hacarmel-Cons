ALTER TABLE public.student_payments
  ADD COLUMN IF NOT EXISTS icount_doc_id text,
  ADD COLUMN IF NOT EXISTS icount_doc_number text,
  ADD COLUMN IF NOT EXISTS invoice_url text,
  ADD COLUMN IF NOT EXISTS icount_doc_type text,
  ADD COLUMN IF NOT EXISTS refund_of_payment_id uuid REFERENCES public.student_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_payments_refund_of ON public.student_payments(refund_of_payment_id);
CREATE INDEX IF NOT EXISTS idx_student_payments_icount_doc ON public.student_payments(icount_doc_id);