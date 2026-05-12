ALTER TABLE public.student_payments ADD COLUMN IF NOT EXISTS payment_group_id uuid;
CREATE INDEX IF NOT EXISTS idx_student_payments_group_id ON public.student_payments(payment_group_id);