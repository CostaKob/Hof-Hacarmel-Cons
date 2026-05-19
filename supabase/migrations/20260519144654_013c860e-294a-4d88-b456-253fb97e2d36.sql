ALTER TABLE public.school_music_payments
  ADD COLUMN IF NOT EXISTS refund_of_payment_id uuid REFERENCES public.school_music_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS icount_doc_type text;

CREATE INDEX IF NOT EXISTS idx_smp_refund_of ON public.school_music_payments(refund_of_payment_id);